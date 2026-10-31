import { formatRuleValue, LADDER_TIERS, RULE_DEFINITIONS, stressSignals, type RuleKey } from '@cred/engine';
import { activeRules } from './engine-runner';
import { handlers } from '@cred/service-kit';
import { credApi } from '@cred/types';
import type { Ctx } from './context';
import { toAudit, toDecision, toLoan, toTxn } from './mappers';
import { ACTIVE_OFFER_STATUSES, buildSnapshot } from './snapshot';

/** CRED internal console: ops, risk and privacy views. */
export function adminHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db, hub } = ctx;
  const where = (memberId?: string) => (memberId ? { memberId } : {});

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
    entries: (await db.auditLog.findMany({ where: { ...where(query.memberId), action: { startsWith: 'permission.' } }, orderBy: { at: 'desc' }, take: query.limit })).map(toAudit),
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

  h.on(credApi.admin.rules, async () => {
    const values = activeRules();
    return {
      rules: (Object.keys(RULE_DEFINITIONS) as RuleKey[]).map((key) => {
        const d = RULE_DEFINITIONS[key];
        return { key, group: d.group, label: d.label, unit: d.unit, value: values[key], display: formatRuleValue(d.unit, values[key]), description: d.description };
      }),
      ladder: LADDER_TIERS.map((t) => ({ ...t })),
      editable: false,
    };
  });

  h.on(credApi.admin.stream, async ({ reply }) => {
    hub.openAdmin(reply);
  });
}
