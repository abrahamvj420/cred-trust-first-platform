import { wellnessReward, type FamilyPerson } from '@cred/engine';
import { conflict, forbidden, handlers, HttpError, notFound } from '@cred/service-kit';
import { ActivitySummary, credApi, ecosystemApi, Relation, WearableProvider, type SessionClaims, type WellnessStatus } from '@cred/types';
import { dataUpdated } from './alerts';
import type { Ctx } from './context';
import { activeRules, gapAreas, insuranceLinked, runFloater, runProtectionGap } from './engine-runner';
import { toClaim, toPolicy } from './mappers';
import { ACTIVE_OFFER_STATUSES } from './snapshot';

type Auth = SessionClaims;

const SHARED = ['A weekly summary: average daily steps, active days and a 0–100 score'];
const NEVER_SHARED = ['Daily step counts', 'Heart rate, sleep or any medical data', 'Location or workouts'];

/** Protect pillar: cover overview, family, floater comparison (4), gap check (6), claims concierge, wellness (4). */
export function protectHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on<typeof credApi.products.policies, Auth>(credApi.products.policies, async ({ auth }) => ({
    policies: (await db.insurancePolicy.findMany({ where: { memberId: auth.memberId, status: 'active' }, orderBy: [{ isEmployer: 'desc' }, { coverPaise: 'desc' }] })).map(toPolicy),
  }));

  h.on<typeof credApi.products.family, Auth>(credApi.products.family, async ({ auth }) => ({
    family: (await db.familyMember.findMany({ where: { memberId: auth.memberId }, orderBy: { age: 'desc' } })).map((f) => ({ id: f.id, name: f.name, relation: Relation.parse(f.relation), age: f.age })),
  }));

  h.on<typeof credApi.products.addFamilyMember, Auth>(credApi.products.addFamilyMember, async ({ auth, body }) => {
    if (body.relation === 'self') throw new HttpError(422, 'invalid_relation', 'You’re already included');
    if (body.relation === 'spouse' && (await db.familyMember.count({ where: { memberId: auth.memberId, relation: 'spouse' } }))) throw conflict('spouse_exists', 'You’ve already added a spouse');
    const f = await db.familyMember.create({ data: { memberId: auth.memberId, name: body.name, relation: body.relation, age: body.age } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'family.added', target: f.id, details: { relation: body.relation } });
    dataUpdated(ctx, auth.memberId, 'insurance');
    return { member: { id: f.id, name: f.name, relation: body.relation, age: f.age } };
  });

  h.on<typeof credApi.products.removeFamilyMember, Auth>(credApi.products.removeFamilyMember, async ({ auth, params }) => {
    const f = await db.familyMember.findUnique({ where: { id: params.familyMemberId } });
    if (!f || f.memberId !== auth.memberId) throw notFound('Family member');
    await db.familyMember.delete({ where: { id: f.id } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'family.removed', target: f.id });
    dataUpdated(ctx, auth.memberId, 'insurance');
    return { ok: true as const };
  });

  /** Feature 4, member-initiated: compare two ways to cover the people chosen. `self` means the member. */
  h.on<typeof credApi.products.healthQuote, Auth>(credApi.products.healthQuote, async ({ auth, body }) => {
    const m = await db.member.findUniqueOrThrow({ where: { id: auth.memberId }, include: { familyMembers: true } });
    const people: FamilyPerson[] = body.familyMemberIds.map((id) => {
      if (id === 'self') return { id: 'self', name: m.name, relation: 'self' as const, age: m.age };
      const f = m.familyMembers.find((x) => x.id === id);
      if (!f) throw notFound('Family member');
      return { id: f.id, name: f.name, relation: Relation.parse(f.relation), age: f.age };
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'insurance.quote_requested', target: null, details: { people: people.map((p) => p.relation), coverPaise: body.coverPaise } });
    return (await runFloater(ctx, auth.memberId, people, body.coverPaise)).view;
  });

  // ── Feature 6: protection gap ──

  h.on<typeof credApi.products.protectionGap, Auth>(credApi.products.protectionGap, async ({ auth }) => {
    const [consent, { areas }, last, active] = await Promise.all([
      insuranceLinked(ctx, auth.memberId),
      gapAreas(ctx, auth.memberId),
      db.engineDecision.findFirst({ where: { memberId: auth.memberId, feature: 'protection_gap' }, orderBy: { createdAt: 'desc' } }),
      db.offer.findFirst({ where: { memberId: auth.memberId, feature: 'protection_gap', status: { in: ACTIVE_OFFER_STATUSES } } }),
    ]);
    return {
      linked: !!consent,
      checkedOn: last?.simDate || (await ctx.simDate()),
      areas: consent ? areas : [],
      explanation: last?.explanation ?? (consent ? 'Tap “Check my cover” to compare what you hold with what we’d suggest.' : 'Link your policies through Account Aggregator so we can check your cover, including any from your employer.'),
      offerId: active?.id ?? null,
    };
  });

  h.on<typeof credApi.products.checkProtectionGap, Auth>(credApi.products.checkProtectionGap, async ({ auth }) => {
    const { areas } = await gapAreas(ctx, auth.memberId);
    const focus = areas.find((a) => !a.covered)?.area ?? 'health';
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'insurance.gap_check_requested', target: null });
    const r = await runProtectionGap(ctx, auth.memberId, { focus, trigger: 'You asked us to check', origin: 'member_initiated', triggerRef: `gap:${Date.now()}`, triggerEventId: null });
    return r.gap;
  });

  // ── Claims concierge ──

  h.on<typeof credApi.products.claims, Auth>(credApi.products.claims, async ({ auth }) => ({
    claims: (await db.claim.findMany({ where: { policy: { memberId: auth.memberId } }, include: { policy: true }, orderBy: { createdAt: 'desc' } })).map(toClaim),
  }));

  h.on<typeof credApi.products.claim, Auth>(credApi.products.claim, async ({ auth, params }) => {
    const c = await db.claim.findUnique({ where: { id: params.claimId }, include: { policy: true } });
    if (!c || c.policy.memberId !== auth.memberId) throw notFound('Claim');
    return { claim: toClaim(c) };
  });

  h.on<typeof credApi.products.fileClaim, Auth>(credApi.products.fileClaim, async ({ auth, body }) => {
    const p = await db.insurancePolicy.findUnique({ where: { id: body.policyId } });
    if (!p || p.memberId !== auth.memberId) throw notFound('Policy');
    if (p.vehicleJson === null && body.amountPaise > p.coverPaise) throw new HttpError(422, 'above_cover', 'That’s more than this policy covers');
    const now = await ctx.simNow();
    const row = await db.claim.create({
      data: { policyId: p.id, amountPaise: body.amountPaise, description: body.description, status: 'filed', timelineJson: JSON.stringify([]), createdAt: now },
    });
    try {
      const r = await ctx.partner(ecosystemApi.insurer.fileClaim, { body: { policyRef: p.externalRef, amountPaise: body.amountPaise, description: body.description, clientRef: row.id } });
      const status = await ctx.partner(ecosystemApi.insurer.claim, { params: { claimRef: r.claimRef } });
      const updated = await db.claim.update({ where: { id: row.id }, data: { externalRef: r.claimRef, status: status.status, timelineJson: JSON.stringify(status.timeline) }, include: { policy: true } });
      await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'claim.filed', target: row.id, details: { policy: p.productName, amountPaise: body.amountPaise } });
      return { claim: toClaim(updated) };
    } catch (e) {
      await db.claim.delete({ where: { id: row.id } });
      throw e;
    }
  });

  // ── Wellness (summaries only) ──

  const wellness = async (memberId: string): Promise<WellnessStatus> => {
    const [link, weeks, floater] = await Promise.all([
      db.wearableLink.findUnique({ where: { memberId } }),
      db.activitySummary.findMany({ where: { memberId }, orderBy: { weekStart: 'desc' }, take: 8 }),
      db.insurancePolicy.findFirst({ where: { memberId, status: 'active', kind: 'health_family_floater', isEmployer: false }, orderBy: { annualPremiumPaise: 'desc' } }),
    ]);
    const summaries = weeks.map((w) => ActivitySummary.parse({ weekStart: w.weekStart, avgDailySteps: w.avgDailySteps, activeDays: w.activeDays, score: w.score }));
    const reward = wellnessReward(floater?.annualPremiumPaise ?? 0, summaries.map((w) => w.score), floater ? 10 : 0, activeRules());
    return {
      linked: !!link,
      provider: link ? WearableProvider.parse(link.provider) : null,
      latest: summaries[0] ?? null,
      weeks: summaries,
      averageScore: reward.averageScore,
      rewardPct: reward.rewardPct,
      rewardEarnedPaise: reward.rewardPaise,
      rewardMaxPaise: reward.maxPaise,
      policyName: floater?.productName ?? null,
      renewalDate: floater?.renewalDate ?? null,
      shared: SHARED,
      neverShared: NEVER_SHARED,
    };
  };

  h.on<typeof credApi.products.wellness, Auth>(credApi.products.wellness, async ({ auth }) => wellness(auth.memberId));

  /** Health data is asked for only here, when the member picks wellness rewards; the permission must already be on. */
  h.on<typeof credApi.products.linkWearable, Auth>(credApi.products.linkWearable, async ({ auth, body }) => {
    const perm = await db.permission.findUnique({ where: { memberId_scope: { memberId: auth.memberId, scope: 'health_data' } } });
    if (perm?.status !== 'granted') throw forbidden('Turn on activity sharing first');
    const m = await db.member.findUniqueOrThrow({ where: { id: auth.memberId } });
    // Ready for the first summaries before asking the health app (they can arrive before it answers)
    const pending = `pending_${m.id}`;
    await db.wearableLink.upsert({
      where: { memberId: m.id },
      update: { provider: body.provider, linkedAt: new Date() },
      create: { memberId: m.id, provider: body.provider, linkRef: pending, customerRef: pending, linkedAt: new Date() },
    });
    try {
      const r = await ctx.partner(ecosystemApi.wearable.link, { body: { phone: m.phone, provider: body.provider, clientRef: m.id } });
      await db.wearableLink.update({ where: { memberId: m.id }, data: { linkRef: r.linkRef, customerRef: r.customerRef } });
    } catch (e) {
      await db.wearableLink.deleteMany({ where: { memberId: m.id, linkRef: pending } });
      throw e;
    }
    await ctx.audit({ memberId: m.id, actor: 'member', action: 'wellness.linked', target: body.provider });
    dataUpdated(ctx, m.id, 'wellness');
    return wellness(m.id);
  });
}
