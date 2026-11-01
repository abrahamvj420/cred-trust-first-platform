import { conflict, handlers, notFound } from '@cred/service-kit';
import { credApi, ecosystemApi, type PrepaymentQuote, type SessionClaims } from '@cred/types';
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
