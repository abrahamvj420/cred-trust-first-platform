import { LADDER_TIERS, type MemberSnapshot } from '@cred/engine';
import { CreditTier, FeatureKey } from '@cred/types';
import type { Ctx } from './context';

export const ACTIVE_OFFER_STATUSES = ['awaiting_permission', 'shown'];

/** Everything the engine may see about a member, from cred.db only. */
export async function buildSnapshot(ctx: Ctx, memberId: string): Promise<MemberSnapshot> {
  const { db } = ctx;
  const today = await ctx.simDate();
  const month = today.slice(0, 7);
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      cards: { include: { statements: { orderBy: { periodEnd: 'desc' }, take: 6, include: { payments: true } } } },
      permissions: true,
      income: true,
      ladder: true,
      offers: true,
      loans: { where: { status: 'disbursed' } },
      helpPlans: { where: { simDate: { startsWith: month } } },
    },
  });
  const card = member.cards[0];
  const smart = member.permissions.find((p) => p.scope === 'smart_savings');
  const prompted = await db.auditLog.count({ where: { memberId, action: 'permission.prompted', target: 'smart_savings' } });
  const tier = CreditTier.parse(member.ladder?.tier ?? 'starter');
  const active = member.offers.find((o) => ACTIVE_OFFER_STATUSES.includes(o.status));

  return {
    memberId,
    today,
    card: { limitPaise: card?.limitPaise ?? 0, outstandingPaise: card?.outstandingPaise ?? 0 },
    statements: (card?.statements ?? []).map((s) => {
      const last = [...s.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
      return {
        periodEnd: s.periodEnd,
        totalDuePaise: s.totalDuePaise,
        minDuePaise: s.minDuePaise,
        paidPaise: s.paidPaise,
        dueDate: s.dueDate,
        paymentKind: (last?.kind as 'full' | 'minimum' | 'custom' | undefined) ?? null,
        onTime: s.payments.length ? s.payments.every((p) => p.onTime) : null,
      };
    }),
    smartSavings: smart ? (smart.status as 'granted' | 'withdrawn') : 'never',
    smartSavingsPrompted: prompted > 0,
    verifiedMonthlyIncomePaise: member.income?.monthlyNetPaise ?? null,
    existingEmiPaise: member.loans.reduce((a, l) => a + l.emiPaise, 0),
    ladder: { tier, limitPaise: LADDER_TIERS.find((t) => t.tier === tier)!.limitPaise },
    offers: {
      activeOfferId: active?.id ?? null,
      proactiveThisMonth: member.offers.filter((o) => o.origin === 'proactive' && o.simDate.startsWith(month)).length,
      offeredTriggerRefs: member.offers.map((o) => o.triggerRef).filter((x): x is string => !!x),
      declines: member.offers
        .filter((o) => o.status === 'declined' && o.decidedSimDate)
        .map((o) => ({ feature: FeatureKey.parse(o.feature), decidedOn: o.decidedSimDate! })),
    },
    helpThisMonth: member.helpPlans.length,
  };
}
