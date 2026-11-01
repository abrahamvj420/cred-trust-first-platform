import { conflict, handlers, notFound } from '@cred/service-kit';
import { repaymentPlanOptions } from '@cred/engine';
import { credApi, ecosystemApi, type PrepaymentQuote, type SessionClaims } from '@cred/types';
import { activeRules } from './rules';
import type { Ctx } from './context';

type Auth = SessionClaims;

/** Early repayment: the lender quotes what it costs and saves; the member confirms; the lender confirms by webhook. */
export function loanHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  const loanFor = async (memberId: string, loanId: string) => {
    const l = await db.loan.findUnique({ where: { id: loanId } });
    if (!l || l.memberId !== memberId) throw notFound('Loan');
    if (l.status !== 'disbursed' || !l.loanRef) throw conflict('loan_not_active', 'This loan isn’t active');
    return l;
  };

  const quote = async (memberId: string, loanId: string, full: boolean, amountPaise: number | null): Promise<PrepaymentQuote> => {
    const l = await loanFor(memberId, loanId);
    const q = await ctx.partner(ecosystemApi.lender.prepaymentQuote, { params: { loanRef: l.loanRef! }, body: { full, amountPaise } });
    const isFull = q.remaining.length === 0;
    return {
      loanId,
      full: isFull,
      principalOutstandingPaise: q.principalOutstandingPaise,
      amountPaise: q.amountPaise,
      chargesPaise: q.chargesPaise,
      chargesNote: q.chargesNote,
      interestSavedPaise: q.interestSavedPaise,
      totalToPayPaise: q.amountPaise + q.chargesPaise,
      remainingInstalments: q.remaining.length,
      newEndDate: q.remaining.at(-1)?.dueDate ?? null,
    };
  };

  /** Pay bounced EMIs now: the lender collects from the bank account and confirms by webhook. */
  h.on<typeof credApi.products.payOverdue, Auth>(credApi.products.payOverdue, async ({ auth, params }) => {
    const l = await loanFor(auth.memberId, params.loanId);
    const r = await ctx.partner(ecosystemApi.lender.collectOverdue, { params: { loanRef: l.loanRef! } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'loan.overdue_paid', target: l.id, details: { amountPaise: r.amountPaise } });
    return { amountPaise: r.amountPaise, status: 'requested' as const };
  });

  // ── Repayment plan: help to clear a carried balance; no new credit while on it ──

  const planFor = async (memberId: string) => {
    const card = await db.card.findFirst({ where: { memberId } });
    const active = await db.loan.findFirst({ where: { memberId, kind: 'repayment_plan', status: { in: ['applied', 'approved', 'disbursed'] } }, orderBy: { createdAt: 'desc' } });
    return { card, active };
  };

  h.on<typeof credApi.products.repaymentPlan, Auth>(credApi.products.repaymentPlan, async ({ auth }) => {
    const { card, active } = await planFor(auth.memberId);
    const rules = activeRules();
    const balance = card?.outstandingPaise ?? 0;
    if (active?.status === 'disbursed') {
      return { eligible: false, note: 'You’re on a plan. Each payment brings you closer; you can see it in Loans.', balancePaise: balance, lenderName: active.lenderName, options: [], activeLoanId: active.id };
    }
    if (balance < rules.planMinBalancePaise) {
      return { eligible: false, note: 'Your card balance is small enough to clear directly: paying the bill in full stops the interest.', balancePaise: balance, lenderName: 'Northstar Finance', options: [], activeLoanId: null };
    }
    return { eligible: true, note: 'Clear what you owe in fixed monthly amounts, at a much lower rate than your card. No fee.', balancePaise: balance, lenderName: 'Northstar Finance', options: repaymentPlanOptions(balance, rules), activeLoanId: active?.id ?? null };
  });

  h.on<typeof credApi.products.startRepaymentPlan, Auth>(credApi.products.startRepaymentPlan, async ({ auth, body }) => {
    const { card, active } = await planFor(auth.memberId);
    if (active?.status === 'disbursed') throw conflict('already_on_plan', 'You’re already on a plan');
    if (!card || card.outstandingPaise < activeRules().planMinBalancePaise) throw conflict('nothing_to_plan', 'There’s no balance to plan');
    if (active) await db.loan.update({ where: { id: active.id }, data: { status: 'declined' } }); // an unfinished earlier start
    const member = await db.member.findUniqueOrThrow({ where: { id: auth.memberId } });
    const q = await ctx.partner(ecosystemApi.lender.quote, { body: { kind: 'repayment_plan', principalPaise: card.outstandingPaise, tenureMonths: body.months, incomeVerified: false, clientRef: auth.memberId } });
    const loan = await db.loan.create({
      data: { memberId: auth.memberId, applicationRef: `pending_${q.quoteRef}`, kind: 'repayment_plan', option: 'plan', lenderName: q.lenderName, principalPaise: q.principalPaise, ratePaBps: q.ratePaBps, tenureMonths: q.tenureMonths, emiPaise: q.emiPaise, processingFeePaise: 0, status: 'applied' },
    });
    const app = await ctx.partner(ecosystemApi.lender.apply, {
      body: { quoteRef: q.quoteRef, applicant: { name: member.name, phone: member.phone }, verifiedMonthlyIncomePaise: null, kfsAcknowledgedAt: new Date().toISOString(), collateral: null, clientRef: loan.id },
    });
    await db.loan.update({ where: { id: loan.id }, data: { applicationRef: app.applicationRef } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'repayment_plan.chosen', target: loan.id, details: { months: body.months, balancePaise: card.outstandingPaise, monthlyPaise: q.emiPaise } });
    return { loanId: loan.id, otp: { sentTo: app.otpSentTo, demoOtp: app.demoOtp } };
  });

  h.on<typeof credApi.products.confirmRepaymentPlan, Auth>(credApi.products.confirmRepaymentPlan, async ({ auth, params, body }) => {
    const l = await db.loan.findUnique({ where: { id: params.loanId } });
    if (!l || l.memberId !== auth.memberId || l.kind !== 'repayment_plan') throw notFound('Plan');
    if (l.status === 'applied') await ctx.partner(ecosystemApi.lender.esign, { params: { applicationRef: l.applicationRef }, body: { otp: body.otp } });
    await db.helpPlan.updateMany({ where: { memberId: auth.memberId, dismissedAt: null }, data: { dismissedAt: new Date() } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'repayment_plan.confirmed', target: l.id });
    return { loanId: l.id, status: 'requested' as const };
  });

  h.on<typeof credApi.products.prepaymentQuote, Auth>(credApi.products.prepaymentQuote, async ({ auth, params, query }) =>
    quote(auth.memberId, params.loanId, query.full === 'true', query.amountPaise ?? null),
  );

  h.on<typeof credApi.products.prepay, Auth>(credApi.products.prepay, async ({ auth, params, body }) => {
    const q = await quote(auth.memberId, params.loanId, body.full, body.amountPaise ?? null);
    const l = await loanFor(auth.memberId, params.loanId);
    await ctx.partner(ecosystemApi.lender.prepay, { params: { loanRef: l.loanRef! }, body: { full: q.full, amountPaise: q.amountPaise, clientRef: l.id } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: q.full ? 'loan.prepay_full_requested' : 'loan.prepay_part_requested', target: l.id, details: { amountPaise: q.amountPaise, interestSavedPaise: q.interestSavedPaise } });
    return { quote: q, status: 'requested' as const };
  });
}
