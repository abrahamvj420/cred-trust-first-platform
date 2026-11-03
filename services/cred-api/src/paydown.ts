import { nextTier, payDownOptions, payDownTruth } from '@cred/engine';
import type { CredDb } from '@cred/db/cred';
import { conflict, handlers } from '@cred/service-kit';
import { credApi, CreditTier, formatInr, type PayDownPlan, type PayDownView, type SessionClaims } from '@cred/types';
import { dataUpdated } from './alerts';
import type { Ctx } from './context';
import { activeRules } from './rules';

type Auth = SessionClaims;
type PlanRow = NonNullable<Awaited<ReturnType<CredDb['payDownPlan']['findFirst']>>>;

/** The plan amount a bill asks for: the monthly amount, or less when the bill itself is smaller. */
export const planAmountFor = (plan: { monthlyPaise: number }, totalDuePaise: number) => Math.min(plan.monthlyPaise, totalDuePaise);

export const activePlan = (db: CredDb, memberId: string) => db.payDownPlan.findFirst({ where: { memberId, status: 'active' }, orderBy: { startedAt: 'desc' } });

/**
 * Progress on a plan, from the member's own bills and payments. The plan starts with
 * the first bill that closes after it begins: the bill already due is paid as the
 * member can (the minimum is fine), since the money for the plan comes with the next salary.
 */
export async function planView(db: CredDb, plan: PlanRow): Promise<PayDownPlan> {
  const card = await db.card.findUniqueOrThrow({ where: { id: plan.cardId } });
  const statements = await db.statement.findMany({ where: { cardId: plan.cardId, periodEnd: { gte: plan.startedOn } }, include: { payments: true }, orderBy: { dueDate: 'asc' } });
  const payments = await db.billPayment.findMany({ where: { statement: { cardId: plan.cardId }, paidAt: { gte: plan.startedAt } } });
  const cycles = statements.map((s) => {
    const planAmountPaise = planAmountFor(plan, s.totalDuePaise);
    const onTime = s.payments.every((p) => p.onTime);
    const state = s.settledOn === null ? 'open' : s.paidPaise >= planAmountPaise && onTime ? 'on_track' : 'below_plan';
    return { dueDate: s.dueDate, planAmountPaise, paidPaise: s.paidPaise, state: state as 'open' | 'on_track' | 'below_plan' };
  });
  const open = statements.find((s) => s.settledOn === null);
  return {
    id: plan.id,
    cardId: plan.cardId,
    cardLabel: `${card.issuerName} •••• ${card.last4}`,
    months: plan.months,
    monthlyPaise: plan.monthlyPaise,
    startBalancePaise: plan.startBalancePaise,
    totalInterestPaise: plan.totalInterestPaise,
    savingPaise: plan.savingPaise,
    startedOn: plan.startedOn,
    status: plan.status as PayDownPlan['status'],
    paidSoFarPaise: payments.reduce((a, p) => a + p.amountPaise, 0),
    cycles,
    onTrackCycles: cycles.filter((c) => c.state === 'on_track').length,
    nextAmountPaise: open ? Math.max(0, planAmountFor(plan, open.totalDuePaise) - open.paidPaise) : 0,
    nextDueDate: open?.dueDate ?? null,
  };
}

/**
 * Pay-down plan: help for a member carrying a balance, on their own card. No lender,
 * no loan and no new credit: CRED shows the truth in rupees and the member pays their
 * card's bank through the normal bill pay. CRED doesn't earn from card interest, so
 * there's nothing to gain from keeping anyone on the minimum.
 */
export function payDownHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  const view = async (memberId: string): Promise<PayDownView> => {
    const rules = activeRules();
    const card = await db.card.findFirst({ where: { memberId } });
    const ladder = await db.ladderProgress.findUnique({ where: { memberId } });
    const pos = { tier: CreditTier.parse(ladder?.tier ?? 'starter'), onTimeStreak: ladder?.onTimeStreak ?? 0 };
    const next = nextTier(pos);
    const path = { onTimeStreak: pos.onTimeStreak, nextTier: next?.tier ?? null, paymentsNeeded: next?.paymentsNeeded ?? null, coinsPer100: rules.rewardCoinsPer100Rupees };
    const plan = await activePlan(db, memberId);
    const balance = card?.outstandingPaise ?? 0;
    if (plan) {
      return { eligible: false, note: 'You’re on a pay-down plan. Pay the plan amount to your card through bill pay each month; paying only the minimum is always your choice.', truth: payDownTruth(balance, rules), plan: await planView(db, plan), ladder: path };
    }
    if (!card || balance < rules.planMinBalancePaise) {
      return { eligible: false, note: 'Your card balance is small enough to clear directly: paying the bill in full stops the interest.', truth: card ? payDownTruth(balance, rules) : null, plan: null, ladder: path };
    }
    return { eligible: true, note: 'A fixed amount each month to your own card’s bank, through bill pay. No loan, no fee, and nothing new to sign.', truth: payDownTruth(balance, rules), plan: null, ladder: path };
  };

  h.on<typeof credApi.products.payDownPlan, Auth>(credApi.products.payDownPlan, async ({ auth }) => view(auth.memberId));

  h.on<typeof credApi.products.startPayDownPlan, Auth>(credApi.products.startPayDownPlan, async ({ auth, body }) => {
    if (await activePlan(db, auth.memberId)) throw conflict('already_on_plan', 'You’re already on a plan');
    const card = await db.card.findFirst({ where: { memberId: auth.memberId } });
    const rules = activeRules();
    if (!card || card.outstandingPaise < rules.planMinBalancePaise) throw conflict('nothing_to_plan', 'There’s no balance to plan');
    const option = payDownOptions(card.outstandingPaise, rules).find((o) => o.months === body.months)!;
    const plan = await db.payDownPlan.create({
      data: {
        memberId: auth.memberId,
        cardId: card.id,
        months: option.months,
        monthlyPaise: option.monthlyPaise,
        startBalancePaise: card.outstandingPaise,
        totalInterestPaise: option.totalInterestPaise,
        savingPaise: option.savingPaise,
        startedOn: await ctx.simDate(),
      },
    });
    await db.helpPlan.updateMany({ where: { memberId: auth.memberId, dismissedAt: null }, data: { dismissedAt: new Date() } });
    await ctx.audit({
      memberId: auth.memberId,
      actor: 'member',
      action: 'pay_down_plan.created',
      target: plan.id,
      details: { months: option.months, monthlyPaise: option.monthlyPaise, balancePaise: card.outstandingPaise, interestSavedVsMinimumPaise: option.savingPaise, lender: 'none' },
    });
    dataUpdated(ctx, auth.memberId, 'cards');
    return view(auth.memberId);
  });

  h.on<typeof credApi.products.stopPayDownPlan, Auth>(credApi.products.stopPayDownPlan, async ({ auth }) => {
    const plan = await activePlan(db, auth.memberId);
    if (!plan) throw conflict('no_plan', 'There’s no plan to stop');
    await db.payDownPlan.update({ where: { id: plan.id }, data: { status: 'stopped', endedOn: await ctx.simDate() } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'pay_down_plan.stopped', target: plan.id });
    dataUpdated(ctx, auth.memberId, 'cards');
    return view(auth.memberId);
  });
}

/** One gentle reminder per bill while a plan is active, never more. */
export function planReminder(plan: { monthlyPaise: number }, totalDuePaise: number, dueDate: string, prettyDue: string) {
  const amount = planAmountFor(plan, totalDuePaise);
  return {
    kind: 'plan' as const,
    title: `Your plan amount this month: ${formatInr(amount)}`,
    body: `Pay it to your card by ${prettyDue} to stay on track. If this month is tight, the minimum is fine too; the plan picks up again next month.`,
    href: '/pay-down-plan',
    sourceRef: `plan:${dueDate}`,
  };
}
