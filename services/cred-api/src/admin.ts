import { formatRuleValue, LADDER_TIERS, RULE_DEFINITIONS, stressSignals, validateRuleChange, type RuleKey } from '@cred/engine';
import { handlers, HttpError, notFound } from '@cred/service-kit';
import { credApi, FeatureKey, ReasonCode } from '@cred/types';
import type { Ctx } from './context';
import { toAudit, toComplaint, toDecision, toLoan, toTxn } from './mappers';
import { activeRules, loadRules } from './rules';
import { ACTIVE_OFFER_STATUSES, buildSnapshot } from './snapshot';

/** CRED internal console: ops, funnel, risk, privacy and rule settings. */
export function adminHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db, hub } = ctx;
  const where = (memberId?: string) => (memberId ? { memberId } : {});

  const ruleView = (key: RuleKey) => {
    const d = RULE_DEFINITIONS[key];
    const value = activeRules()[key];
    return { key, group: d.group, label: d.label, unit: d.unit, value, display: formatRuleValue(d.unit, value), description: d.description, min: d.min, max: d.max, changed: value !== d.value, defaultValue: d.value };
  };

  h.on(credApi.admin.members, async () => {
    const month = (await ctx.simDate()).slice(0, 7);
    const members = await db.member.findMany({ where: { deletedAt: null }, include: { permissions: true, offers: true }, orderBy: { name: 'asc' } });
    return {
      members: await Promise.all(
        members.map(async (m) => ({
          id: m.id,
          personaKey: m.personaKey as 'aarav',
          name: m.name,
          phoneMasked: `XXXXXX${m.phone.slice(-4)}`,
          city: m.city,
          memberSince: m.memberSince,
          vpa: m.vpa,
          smartSavings: m.permissions.some((p) => p.scope === 'smart_savings' && p.status === 'granted'),
          stressed: stressSignals(await buildSnapshot(ctx, m.id), activeRules()).length > 0,
          offersThisMonth: m.offers.filter((o) => o.simDate.startsWith(month)).length,
          activeOfferId: m.offers.find((o) => ACTIVE_OFFER_STATUSES.includes(o.status))?.id ?? null,
        })),
      ),
    };
  });

  h.on(credApi.admin.transactions, async ({ query }) => {
    const rows = await db.cardTransaction.findMany({
      where: query.memberId ? { card: { memberId: query.memberId } } : {},
      include: { card: { include: { member: true } } },
      orderBy: { postedAt: 'desc' },
      take: query.limit,
    });
    return { transactions: rows.map((t) => ({ ...toTxn(t), memberId: t.card.memberId, memberName: t.card.member.name })) };
  });

  h.on(credApi.admin.decisions, async ({ query }) => {
    const rows = await db.engineDecision.findMany({
      where: { ...where(query.memberId), ...(query.outcome ? { outcome: query.outcome } : {}), ...(query.feature ? { feature: query.feature } : {}) },
      include: { member: true, offer: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return { decisions: rows.map((d) => ({ ...toDecision(d), memberName: d.member.name })) };
  });

  h.on(credApi.admin.permissionLog, async ({ query }) => ({
    entries: (await db.auditLog.findMany({ where: { ...where(query.memberId), OR: [{ action: { startsWith: 'permission.' } }, { action: { startsWith: 'aa.' } }, { action: { startsWith: 'wellness.' } }] }, orderBy: { at: 'desc' }, take: query.limit })).map(toAudit),
  }));

  h.on(credApi.admin.audit, async ({ query }) => ({
    entries: (await db.auditLog.findMany({ where: where(query.memberId), orderBy: { at: 'desc' }, take: query.limit })).map(toAudit),
  }));

  h.on(credApi.admin.loans, async ({ query }) => {
    const rows = await db.loan.findMany({ where: where(query.memberId), include: { installments: true, member: true }, orderBy: { createdAt: 'desc' }, take: query.limit });
    return { loans: rows.map((l) => ({ ...toLoan(l), memberId: l.memberId, memberName: l.member.name })) };
  });

  h.on(credApi.admin.webhooks, async ({ query }) => {
    const rows = await db.inboundWebhook.findMany({ where: where(query.memberId), orderBy: { receivedAt: 'desc' }, take: query.limit });
    return { webhooks: rows.map((w) => ({ eventId: w.eventId, type: w.type, partner: w.partner, signatureOk: w.signatureOk, duplicate: w.duplicateCount > 0, receivedAt: w.receivedAt.toISOString() })) };
  });

  h.on(credApi.admin.partnerCalls, async ({ query }) => ({
    calls: (await db.partnerCall.findMany({ where: where(query.memberId), orderBy: { at: 'desc' }, take: query.limit })).map((c) => ({ ...c, at: c.at.toISOString() })),
  }));

  // ── Rules, editable live ──

  h.on(credApi.admin.rules, async () => ({
    rules: (Object.keys(RULE_DEFINITIONS) as RuleKey[]).map(ruleView),
    ladder: LADDER_TIERS.map((t) => ({ ...t })),
    editable: true,
  }));

  h.on(credApi.admin.updateRule, async ({ params, body }) => {
    const problem = validateRuleChange(activeRules(), params.key, body.value);
    if (problem) throw new HttpError(422, 'invalid_rule', problem);
    const key = params.key as RuleKey;
    const from = activeRules()[key];
    await db.ruleSetting.upsert({ where: { key }, update: { value: body.value }, create: { key, value: body.value } });
    await loadRules(db);
    await ctx.audit({ memberId: null, actor: 'admin', action: 'rule.changed', target: key, details: { from, to: body.value, reason: body.reason } });
    return { rule: ruleView(key) };
  });

  h.on(credApi.admin.resetRules, async ({ body }) => {
    const changed = await db.ruleSetting.findMany();
    await db.ruleSetting.deleteMany();
    await loadRules(db);
    await ctx.audit({ memberId: null, actor: 'admin', action: 'rule.reset_all', target: null, details: { reason: body.reason, keys: changed.map((c) => c.key) } });
    return { ok: true as const };
  });

  // ── Overview: funnel by feature, member gains, defaults ──

  h.on(credApi.admin.overview, async () => {
    const [decisions, offers, loans, statementsMissed, members, openComplaints, policies] = await Promise.all([
      db.engineDecision.findMany({ select: { feature: true, outcome: true, reasonsJson: true } }),
      db.offer.findMany({ select: { feature: true, status: true, shownAt: true, netBenefitPaise: true } }),
      db.loan.findMany({ where: { status: { in: ['disbursed', 'closed'] } }, include: { installments: true } }),
      db.statement.count({ where: { ladderOutcome: 'missed' } }),
      db.member.findMany({ where: { deletedAt: null }, select: { id: true } }),
      db.complaint.count({ where: { status: 'open' } }),
      db.insurancePolicy.aggregate({ _sum: { wellnessSavedPaise: true }, _count: { wellnessSavedPaise: true }, where: { wellnessSavedPaise: { gt: 0 } } }),
    ]);
    const funnel = FeatureKey.options.map((feature) => {
      const ds = decisions.filter((d) => d.feature === feature);
      const os = offers.filter((o) => o.feature === feature);
      const blocked = new Map<string, number>();
      for (const d of ds.filter((x) => x.outcome === 'blocked')) {
        const r = (JSON.parse(d.reasonsJson) as string[])[0] ?? 'ok';
        blocked.set(r, (blocked.get(r) ?? 0) + 1);
      }
      return {
        feature,
        decisions: ds.length,
        offers: os.length,
        awaitingPermission: os.filter((o) => o.status === 'awaiting_permission').length,
        shown: os.filter((o) => o.shownAt).length,
        accepted: os.filter((o) => o.status === 'accepted').length,
        dismissed: os.filter((o) => o.status === 'declined').length,
        expired: os.filter((o) => o.status === 'expired').length,
        help: ds.filter((d) => d.outcome === 'help').length,
        available: ds.filter((d) => d.outcome === 'available').length,
        blocked: [...blocked.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason: ReasonCode.parse(reason), count })),
      };
    });
    const accepted = offers.filter((o) => o.status === 'accepted');
    const gains = [
      ...FeatureKey.options
        .map((f) => {
          const a = accepted.filter((o) => o.feature === f);
          return { source: `Accepted: ${f.replaceAll('_', ' ')}`, count: a.length, gainPaise: a.reduce((s, o) => s + o.netBenefitPaise, 0) };
        })
        .filter((g) => g.count > 0),
      { source: 'Interest saved by repaying early', count: loans.filter((l) => l.interestSavedPaise > 0).length, gainPaise: loans.reduce((s, l) => s + l.interestSavedPaise, 0) },
      { source: 'Wellness discounts at renewal', count: policies._count.wellnessSavedPaise, gainPaise: policies._sum.wellnessSavedPaise ?? 0 },
    ];
    const today = await ctx.simDate();
    const daysPast = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
    const overdue = loans.flatMap((l) => l.installments.filter((i) => i.status === 'overdue').map((i) => ({ loanId: l.id, i })));
    const over90 = new Set(overdue.filter((x) => daysPast(x.i.dueDate) >= 90).map((x) => x.loanId));
    const strained = (await Promise.all(members.map(async (m) => stressSignals(await buildSnapshot(ctx, m.id), activeRules()).length > 0))).filter(Boolean).length;
    const shown = offers.filter((o) => o.shownAt).length;
    return {
      simDate: today,
      members: members.length,
      kpis: {
        decisions: decisions.length,
        offersShown: shown,
        accepted: accepted.length,
        acceptanceRateBps: shown ? Math.round((accepted.length * 10_000) / shown) : 0,
        blocked: decisions.filter((d) => d.outcome === 'blocked').length,
        help: decisions.filter((d) => d.outcome === 'help').length,
        memberGainsPaise: gains.reduce((s, g) => s + g.gainPaise, 0),
        openComplaints,
      },
      funnel,
      gains,
      defaults: {
        activeLoans: loans.filter((l) => l.status === 'disbursed').length,
        loansWithOverdue: new Set(overdue.map((x) => x.loanId)).size,
        overdueInstalments: overdue.length,
        overduePaise: overdue.reduce((s, x) => s + x.i.amountPaise, 0),
        loansOver90Days: over90.size,
        defaultRateBps: loans.length ? Math.round((over90.size * 10_000) / loans.length) : 0,
        cardBillsMissed: statementsMissed,
        membersShowingStrain: strained,
      },
    };
  });

  // ── Complaints ──

  h.on(credApi.admin.complaints, async ({ query }) => ({
    complaints: (await db.complaint.findMany({ where: where(query.memberId), include: { member: true }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: query.limit })).map((c) => ({
      ...toComplaint(c),
      memberId: c.memberId,
      memberName: c.member.name,
    })),
  }));

  h.on(credApi.admin.resolveComplaint, async ({ params, body }) => {
    const c = await db.complaint.findUnique({ where: { id: params.complaintId } });
    if (!c) throw notFound('Complaint');
    const updated = await db.complaint.update({ where: { id: c.id }, data: { status: 'resolved', resolution: body.resolution, resolvedAt: new Date() } });
    await ctx.audit({ memberId: c.memberId, actor: 'admin', action: 'complaint.resolved', target: c.id, details: { resolution: body.resolution } });
    hub.member(c.memberId, { type: 'data.updated', data: { area: 'complaints' } });
    return { complaint: toComplaint(updated) };
  });

  h.on(credApi.admin.stream, async ({ reply }) => {
    hub.openAdmin(reply);
  });
}
