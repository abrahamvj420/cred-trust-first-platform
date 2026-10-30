import { handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi, LoanQuote, type EmiInstallment } from '@cred/types';
import { addMonthsYmd, demoCode, maskPhone, simDate, simNow, type Ctx } from './context';

/** The lender's own loan maths: equal EMIs on a reducing balance (it is an independent institution). */
function schedule(principal: number, ratePaBps: number, months: number, firstDue: string): EmiInstallment[] {
  const r = ratePaBps / 10_000 / 12;
  const emi = Math.round((principal * r) / (1 - (1 + r) ** -months));
  let balance = principal;
  return Array.from({ length: months }, (_, i) => {
    const interest = Math.round(balance * r);
    const principalPart = i === months - 1 ? balance : emi - interest;
    balance -= principalPart;
    return { n: i + 1, dueDate: addMonthsYmd(firstDue, i), amountPaise: principalPart + interest, principalPaise: principalPart, interestPaise: interest, status: 'upcoming' as const };
  });
}

const LENDER_FOR = { purchase_emi: 'lnd_northstar', personal_loan: 'lnd_banyan', loan_against_funds: 'lnd_northstar', balance_switch_emi: 'lnd_northstar' } as const;
const MAX_PRINCIPAL_PAISE = 5_00_000_00;

export function lenderHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  /** Anonymous, indicative pricing: the lender learns nothing about the member yet. */
  h.on(ecosystemApi.lender.quote, async ({ body }) => {
    const lender = await db.lender.findUniqueOrThrow({ where: { id: LENDER_FOR[body.kind] } });
    if (body.tenureMonths > lender.maxTenure) throw new HttpError(422, 'tenure_too_long', `${lender.name} lends up to ${lender.maxTenure} months`);
    const firstDue = addMonthsYmd(await simDate(db), 1);
    const sched = schedule(body.principalPaise, lender.ratePaBps, body.tenureMonths, firstDue);
    const fee = Math.round((body.principalPaise * lender.feeBps) / 10_000);
    const app = await db.loanApplication.create({
      data: {
        lenderId: lender.id,
        quoteRef: `q_${crypto.randomUUID()}`,
        kind: body.kind,
        principalPaise: body.principalPaise,
        tenureMonths: body.tenureMonths,
        ratePaBps: lender.ratePaBps,
        feeBps: lender.feeBps,
        quoteJson: '{}',
        clientRef: body.clientRef,
      },
    });
    const quote = LoanQuote.parse({
      quoteRef: app.quoteRef,
      lenderName: lender.name,
      kind: body.kind,
      principalPaise: body.principalPaise,
      tenureMonths: body.tenureMonths,
      ratePaBps: lender.ratePaBps,
      feeBps: lender.feeBps,
      processingFeePaise: fee,
      gstOnFeePaise: Math.round(fee * 0.18),
      emiPaise: sched[0]!.amountPaise,
      totalInterestPaise: sched.reduce((a, i) => a + i.interestPaise, 0),
      schedule: sched,
    });
    await db.loanApplication.update({ where: { id: app.id }, data: { quoteJson: JSON.stringify(quote) } });
    return quote;
  });

  h.on(ecosystemApi.lender.apply, async ({ body }) => {
    const app = await db.loanApplication.findUnique({ where: { quoteRef: body.quoteRef } });
    if (!app) throw notFound('Quote');
    if (app.status !== 'quoted') throw new HttpError(409, 'already_applied', 'This quote was already used');
    const person = await db.person.findUnique({ where: { phone: body.applicant.phone } });
    if (!person) throw new HttpError(422, 'kyc_failed', 'Applicant not found at the lender’s KYC provider');
    const otp = demoCode();
    await db.loanApplication.update({
      where: { id: app.id },
      data: { personId: person.id, status: 'applied', kfsAcknowledgedAt: new Date(body.kfsAcknowledgedAt), clientRef: body.clientRef, otp, verifiedIncomePaise: body.verifiedMonthlyIncomePaise },
    });
    return { applicationRef: app.id, status: 'applied' as const, otpSentTo: maskPhone(person.phone), demoOtp: otp };
  });

  h.on(ecosystemApi.lender.application, async ({ params }) => {
    const app = await db.loanApplication.findUnique({ where: { id: params.applicationRef }, include: { loan: true } });
    if (!app) throw notFound('Application');
    return { applicationRef: app.id, status: app.status as 'applied', loanRef: app.loan?.id ?? null };
  });

  /** Demo: any 6 digits e-sign. Decision and disbursal are reported to CRED by webhook. */
  h.on(ecosystemApi.lender.esign, async ({ params }) => {
    const app = await db.loanApplication.findUnique({ where: { id: params.applicationRef } });
    if (!app || !app.personId) throw notFound('Application');
    if (app.status !== 'applied') return { applicationRef: app.id, status: app.status as 'approved' };

    if (app.principalPaise > MAX_PRINCIPAL_PAISE) {
      await db.loanApplication.update({ where: { id: app.id }, data: { status: 'declined' } });
      await ctx.outbox.emit('lender.loan.decided', { applicationRef: app.id, clientRef: app.clientRef, decision: 'declined', reason: 'Above lending limit', ratePaBps: app.ratePaBps });
      return { applicationRef: app.id, status: 'declined' as const };
    }

    const quote = LoanQuote.parse(JSON.parse(app.quoteJson));
    await db.loanApplication.update({ where: { id: app.id }, data: { status: 'approved' } });
    await ctx.outbox.emit('lender.loan.decided', { applicationRef: app.id, clientRef: app.clientRef, decision: 'approved', reason: null, ratePaBps: app.ratePaBps });

    // Disburse: an EMI pays the card down; a personal loan lands in the bank account.
    const disbursedAt = await simNow(db);
    const loan = await db.loanAccount.create({ data: { applicationId: app.id, disbursedAt, scheduleJson: JSON.stringify(quote.schedule) } });
    await db.loanApplication.update({ where: { id: app.id }, data: { status: 'disbursed' } });
    if (app.kind === 'purchase_emi') {
      const card = await db.creditCardAccount.findFirst({ where: { personId: app.personId } });
      if (card) await db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: Math.max(0, card.outstandingPaise - app.principalPaise) } });
    } else {
      const account = await db.bankAccount.findFirst({ where: { personId: app.personId } });
      if (account) {
        await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: app.principalPaise } } });
        await db.bankTxn.create({ data: { accountId: account.id, kind: 'credit', amountPaise: app.principalPaise, narration: `LOAN DISBURSAL ${quote.lenderName.toUpperCase()}`, at: disbursedAt } });
      }
    }
    await ctx.outbox.emit('lender.loan.disbursed', {
      applicationRef: app.id,
      loanRef: loan.id,
      clientRef: app.clientRef,
      kind: quote.kind,
      principalPaise: quote.principalPaise,
      ratePaBps: quote.ratePaBps,
      tenureMonths: quote.tenureMonths,
      emiPaise: quote.emiPaise,
      schedule: quote.schedule,
      disbursedAt: disbursedAt.toISOString(),
    });
    return { applicationRef: app.id, status: 'approved' as const };
  });
}
