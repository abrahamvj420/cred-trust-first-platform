import { catalog } from '@cred/db/seed';
import { conflict, handlers, HttpError, notFound } from '@cred/service-kit';
import { ClaimStatus, ecosystemApi, InsurerQuote, type EndpointBody, type Vehicle, type WaitingPeriod } from '@cred/types';
import { randomUUID } from 'node:crypto';
import { policyKindOf } from './aa';
import { addMonthsYmd, demoCode, maskPhone, simDate, simNow, type Ctx } from './context';

/**
 * Sahaj Health Insurance (also writes motor cover). Quotes are anonymous:
 * ages and relations, or the vehicle. The person is known only at proposal.
 */
const PRODUCT_ID = { family_floater: 'prd_floater', super_top_up: 'prd_topup', motor_own_damage: 'prd_motor_od', motor_comprehensive: 'prd_motor_comp' } as const;
const HEALTH_WAITS: WaitingPeriod[] = [
  { label: 'Initial waiting', detail: '30 days (accidents are covered from day one)', days: 30 },
  { label: 'Named illnesses (e.g. cataract, hernia)', detail: '2 years', days: 730 },
  { label: 'Pre-existing conditions', detail: '3 years', days: 1095 },
];
const GST_BPS_MOTOR = 1800;

const rates = (id: string) => catalog.INSURER.products.find((p) => p.id === id)!.rates;

function price(body: EndpointBody<typeof ecosystemApi.insurer.quote>) {
  if (body.product === 'family_floater') {
    return { cover: body.coverPaise, deductible: 0, premium: catalog.floaterPremiumPaise(rates('prd_floater'), body.members.map((m) => m.age), body.coverPaise), gst: 0, vehicle: null as Vehicle | null, members: body.members };
  }
  if (body.product === 'super_top_up') {
    return { cover: body.coverPaise, deductible: body.deductiblePaise, premium: catalog.floaterPremiumPaise(rates('prd_topup'), body.members.map((m) => m.age), body.coverPaise), gst: 0, vehicle: null, members: body.members };
  }
  const bps = rates(PRODUCT_ID[body.product])[0]!.paise;
  const base = Math.round((body.vehicle.idvPaise * bps) / 10_000) + (body.product === 'motor_comprehensive' ? rates('prd_motor_tp')[0]!.paise : 0);
  const gst = Math.round((base * GST_BPS_MOTOR) / 10_000);
  return { cover: body.vehicle.idvPaise, deductible: 0, premium: base + gst, gst, vehicle: body.vehicle, members: [] };
}

export function insurerHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.insurer.quote, async ({ body }) => {
    const productId = PRODUCT_ID[body.product];
    const product = await db.insuranceProduct.findUniqueOrThrow({ where: { id: productId }, include: { insurer: true } });
    const p = price(body);
    const row = await db.insuranceQuote.create({ data: { productId, quoteJson: '{}', clientRef: body.clientRef } });
    const health = body.product === 'family_floater' || body.product === 'super_top_up';
    const quote = InsurerQuote.parse({
      quoteRef: row.id,
      insurerName: product.insurer.name,
      productName: product.name,
      kind: body.product,
      coverPaise: p.cover,
      deductiblePaise: p.deductible,
      annualPremiumPaise: p.premium,
      gstPaise: p.gst,
      wellnessRewardMaxPct: product.wellnessRewardMaxPct,
      members: p.members,
      vehicle: p.vehicle,
      waitingPeriods: health ? HEALTH_WAITS : [],
      freeLookDays: health ? 30 : 0,
    });
    await db.insuranceQuote.update({ where: { id: row.id }, data: { quoteJson: JSON.stringify(quote) } });
    return quote;
  });

  h.on(ecosystemApi.insurer.propose, async ({ body }) => {
    const quotes = await db.insuranceQuote.findMany({ where: { id: { in: body.quoteRefs } } });
    if (quotes.length !== body.quoteRefs.length) throw notFound('Quote');
    if (quotes.some((q) => q.status !== 'quoted')) throw conflict('already_proposed', 'This quote was already used');
    const person = await db.person.findUnique({ where: { phone: body.proposer.phone } });
    if (!person) throw new HttpError(422, 'kyc_failed', 'Proposer not found at the insurer’s KYC provider');
    const proposalRef = `prp_${randomUUID()}`;
    const otp = demoCode();
    await db.insuranceQuote.updateMany({
      where: { id: { in: body.quoteRefs } },
      data: { status: 'proposed', personId: person.id, insuredJson: JSON.stringify({ people: body.insured, replaces: body.replacesPolicyRef }), otp, proposalRef, clientRef: body.clientRef },
    });
    return { proposalRef, otpSentTo: maskPhone(person.phone), demoOtp: otp };
  });

  /** Demo: any 6 digits confirm. The premium is collected from the proposer's bank account; the policy is issued. */
  h.on(ecosystemApi.insurer.confirmProposal, async ({ params }) => {
    const quotes = await db.insuranceQuote.findMany({ where: { proposalRef: params.proposalRef }, include: { product: { include: { insurer: true } } } });
    if (!quotes.length || !quotes[0]!.personId) throw notFound('Proposal');
    if (quotes.every((q) => q.status === 'issued')) return { policyRefs: quotes.map((q) => q.policyId!), status: 'issued' as const };
    const personId = quotes[0]!.personId;
    const account = await db.bankAccount.findFirst({ where: { personId } });
    const total = quotes.reduce((a, q) => a + InsurerQuote.parse(JSON.parse(q.quoteJson)).annualPremiumPaise, 0);
    if (!account || account.balancePaise < total) throw new HttpError(422, 'insufficient_funds', 'Your Mock Bank account doesn’t have enough balance for the premium.');
    const now = await simNow(db);
    const today = await simDate(db);
    const refs: string[] = [];
    await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { decrement: total } } });
    await db.bankTxn.create({ data: { accountId: account.id, kind: 'debit', amountPaise: -total, narration: 'PREMIUM SAHAJ INSURANCE', at: now } });
    for (const q of quotes) {
      const quote = InsurerQuote.parse(JSON.parse(q.quoteJson));
      const { people: insured, replaces } = JSON.parse(q.insuredJson ?? '{"people":[]}') as { people: { relation: string }[]; replaces: string | null };
      // The policy this one replaces is cancelled (its unused premium is refunded by the insurer)
      if (replaces) await db.policy.deleteMany({ where: { id: replaces, personId } });
      const members = quote.vehicle ? [] : insured.length ? insured.map((i) => i.relation) : quote.members.map((m) => m.relation);
      const policy = await db.policy.create({
        data: {
          personId,
          productId: q.productId,
          coverPaise: quote.coverPaise,
          annualPremiumPaise: quote.annualPremiumPaise,
          deductiblePaise: quote.deductiblePaise,
          membersCoveredJson: JSON.stringify(members),
          renewalDate: addMonthsYmd(today, 12),
          clientRef: q.clientRef,
          vehicleJson: quote.vehicle ? JSON.stringify(quote.vehicle) : null,
        },
      });
      await db.insuranceQuote.update({ where: { id: q.id }, data: { status: 'issued', policyId: policy.id } });
      refs.push(policy.id);
      await ctx.outbox.emit('insurer.policy.issued', {
        customerRef: personId,
        policyRef: policy.id,
        clientRef: q.clientRef,
        insurerName: q.product.insurer.name,
        productName: q.product.name,
        kind: policyKindOf(q.product.kind, false),
        coverPaise: quote.coverPaise,
        deductiblePaise: quote.deductiblePaise,
        annualPremiumPaise: quote.annualPremiumPaise,
        membersCovered: members as ('self' | 'spouse' | 'child' | 'parent' | 'parent_in_law')[],
        renewalDate: policy.renewalDate!,
        vehicle: quote.vehicle,
      });
    }
    return { policyRefs: refs, status: 'issued' as const };
  });

  h.on(ecosystemApi.insurer.fileClaim, async ({ body }) => {
    const policy = await db.policy.findUnique({ where: { id: body.policyRef } });
    if (!policy) throw notFound('Policy');
    if (body.amountPaise > policy.coverPaise) throw new HttpError(422, 'above_cover', 'That’s more than this policy covers');
    const at = (await simNow(db)).toISOString();
    const claim = await db.insuranceClaim.create({
      data: {
        policyId: policy.id,
        amountPaise: body.amountPaise,
        description: body.description,
        status: 'filed',
        timelineJson: JSON.stringify([{ status: 'filed', at, note: 'Claim received. A claims officer will review it.' }]),
        clientRef: body.clientRef,
      },
    });
    return { claimRef: claim.id, status: 'filed' as const };
  });

  h.on(ecosystemApi.insurer.claim, async ({ params }) => {
    const c = await db.insuranceClaim.findUnique({ where: { id: params.claimRef } });
    if (!c) throw notFound('Claim');
    return { claimRef: c.id, status: ClaimStatus.parse(c.status), timeline: JSON.parse(c.timelineJson) };
  });

  h.on(ecosystemApi.insurer.customerPolicies, async ({ params }) => {
    const person = await db.person.findUnique({ where: { id: params.customerRef } });
    if (!person) throw notFound('Customer');
    const policies = await db.policy.findMany({ where: { personId: person.id }, include: { product: true, claims: true } });
    return {
      insurerName: catalog.INSURER.name,
      customerName: person.name,
      policies: policies.map((p) => ({
        policyRef: p.id,
        productName: p.product.name,
        kind: policyKindOf(p.product.kind, p.isEmployer),
        coverPaise: p.coverPaise,
        annualPremiumPaise: p.annualPremiumPaise,
        isEmployer: p.isEmployer,
        employerName: p.employerName,
        membersCovered: JSON.parse(p.membersCoveredJson),
        renewalDate: p.renewalDate,
        claims: p.claims.map((c) => ({ claimRef: c.id, amountPaise: c.amountPaise, status: ClaimStatus.parse(c.status), filedAt: c.createdAt.toISOString() })),
      })),
    };
  });
}

const NEXT: Partial<Record<ClaimStatus, { status: ClaimStatus; note: string }>> = {
  filed: { status: 'under_review', note: 'A claims officer is reviewing your documents.' },
  documents_pending: { status: 'under_review', note: 'Documents received; review continues.' },
  under_review: { status: 'approved', note: 'Approved. Payment is being processed.' },
  approved: { status: 'settled', note: 'Paid to your bank account.' },
};

/** Moves a claim one step and tells the app that filed it. */
export async function progressClaim(ctx: Ctx, claimId: string): Promise<boolean> {
  const { db } = ctx;
  const c = await db.insuranceClaim.findUnique({ where: { id: claimId }, include: { policy: true } });
  if (!c) return false;
  const next = NEXT[ClaimStatus.parse(c.status)];
  if (!next) return false;
  const at = (await simNow(db)).toISOString();
  const timeline = [...JSON.parse(c.timelineJson), { status: next.status, at, note: next.note }];
  await db.insuranceClaim.update({ where: { id: c.id }, data: { status: next.status, timelineJson: JSON.stringify(timeline) } });
  if (next.status === 'settled') {
    const account = await db.bankAccount.findFirst({ where: { personId: c.policy.personId } });
    if (account) {
      await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: c.amountPaise } } });
      await db.bankTxn.create({ data: { accountId: account.id, kind: 'credit', amountPaise: c.amountPaise, narration: 'CLAIM SETTLEMENT SAHAJ', at: new Date(at) } });
    }
  }
  await ctx.outbox.emit('insurer.claim.updated', { claimRef: c.id, policyRef: c.policyId, status: next.status, note: next.note, at });
  return true;
}

/**
 * Renewal notices for policies an app helps manage (clientRef set), sent once
 * per renewal date, `daysAhead` before it; policies past their date roll over a year.
 */
export async function renewals(ctx: Ctx, today: string, opts: { personId?: string; force?: boolean; daysAhead?: number } = {}): Promise<number> {
  const { db } = ctx;
  const ahead = new Date(Date.parse(today) + (opts.daysAhead ?? 30) * 86_400_000).toISOString().slice(0, 10);
  let n = 0;
  for (const p of await db.policy.findMany({ where: { clientRef: { not: null }, isEmployer: false, ...(opts.personId ? { personId: opts.personId } : {}) }, include: { product: true } })) {
    if (!p.renewalDate) continue;
    if (p.renewalDate <= today && !opts.force) {
      await db.policy.update({ where: { id: p.id }, data: { renewalDate: addMonthsYmd(p.renewalDate, 12) } });
      continue;
    }
    if ((opts.force || p.renewalDate <= ahead) && p.renewalNoticeFor !== p.renewalDate) {
      await db.policy.update({ where: { id: p.id }, data: { renewalNoticeFor: p.renewalDate } });
      await ctx.outbox.emit('insurer.policy.renewal_due', {
        customerRef: p.personId,
        policyRef: p.id,
        kind: policyKindOf(p.product.kind, p.isEmployer),
        coverPaise: p.coverPaise,
        renewalPremiumPaise: p.annualPremiumPaise,
        renewalDate: p.renewalDate,
      });
      n += 1;
    }
  }
  return n;
}

/** A car bought at a dealer, sold with only the third-party cover the law requires. */
export async function dealerMotorPolicy(ctx: Ctx, personId: string, vehicle: Vehicle): Promise<string> {
  const { db } = ctx;
  const existing = await db.policy.findFirst({ where: { personId, vehicleJson: { contains: vehicle.registration } } });
  if (existing) return existing.id;
  const tp = rates('prd_motor_tp')[0]!.paise;
  const premium = tp + Math.round((tp * GST_BPS_MOTOR) / 10_000);
  const p = await db.policy.create({
    data: {
      personId,
      productId: 'prd_motor_tp',
      coverPaise: 7_50_000_00, // third-party property damage limit
      annualPremiumPaise: premium,
      membersCoveredJson: '[]',
      renewalDate: addMonthsYmd(await simDate(db), 12),
      vehicleJson: JSON.stringify(vehicle),
    },
  });
  return p.id;
}
