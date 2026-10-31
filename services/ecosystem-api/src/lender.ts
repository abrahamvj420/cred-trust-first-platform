import { handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi, LoanQuote, type EmiInstallment, type LoanKind } from '@cred/types';
import { addMonthsYmd, demoCode, maskPhone, simDate, simNow, type Ctx } from './context';

/** The lender's own loan maths: equal EMIs on a reducing balance (it is an independent institution). */
export function schedule(principal: number, ratePaBps: number, months: number, firstDue: string, startN = 1): EmiInstallment[] {
  const r = ratePaBps / 10_000 / 12;
  const emi = r === 0 ? Math.round(principal / months) : Math.round((principal * r) / (1 - (1 + r) ** -months));
  let balance = principal;
  return Array.from({ length: months }, (_, i) => {
    const interest = Math.round(balance * r);
    const principalPart = i === months - 1 ? balance : emi - interest;
    balance -= principalPart;
    return { n: startN + i, dueDate: addMonthsYmd(firstDue, i), amountPaise: principalPart + interest, principalPaise: principalPart, interestPaise: interest, status: 'upcoming' as const };
  });
}

/** Which lender offers each product, and how it is priced on top of the lender's base rate. */
const PRODUCTS: Record<LoanKind, { lender: string; rateOffsetBps: number; stepDown?: { afterOnTimePayments: number; offsetBps: number }[] }> = {
  purchase_emi: { lender: 'lnd_northstar', rateOffsetBps: 0 },
  personal_loan: { lender: 'lnd_banyan', rateOffsetBps: 0 },
  loan_against_funds: { lender: 'lnd_keystone', rateOffsetBps: 0 },
  // Card-Balance Switch: starts 1% above Northstar's base, steps down 1% after 2 and 4 on-time EMIs
  balance_switch_emi: { lender: 'lnd_northstar', rateOffsetBps: 100, stepDown: [{ afterOnTimePayments: 2, offsetBps: 0 }, { afterOnTimePayments: 4, offsetBps: -100 }] },
};
const VERIFIED_DISCOUNT_BPS = 100;
/** The lender's own loan-to-value limits; CRED's are stricter. */
const LENDER_MAX_LTV_BPS = { equity: 5000, hybrid: 5000, debt: 8000, fixed_deposit: 9000, gold: 7500 } as const;
const MAX_PRINCIPAL_PAISE = 5_00_000_00;

interface Collateral {
  kind: 'mutual_fund' | 'fixed_deposit' | 'gold';
  ref: string;
  schemeCode: string | null;
  units: number | null;
  valuePaise: number;
  assetClass: keyof typeof LENDER_MAX_LTV_BPS;
}

export function lenderHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  /** Anonymous, indicative pricing: the lender learns nothing about the member except, if they chose, that salary is verified. */
  h.on(ecosystemApi.lender.quote, async ({ body }) => {
    const product = PRODUCTS[body.kind];
    const lender = await db.lender.findUniqueOrThrow({ where: { id: product.lender } });
    if (body.tenureMonths > lender.maxTenure) throw new HttpError(422, 'tenure_too_long', `${lender.name} lends up to ${lender.maxTenure} months`);
    const discount = body.incomeVerified ? VERIFIED_DISCOUNT_BPS : 0;
    const rate = lender.ratePaBps + product.rateOffsetBps - discount;
    const firstDue = addMonthsYmd(await simDate(db), 1);
    const sched = schedule(body.principalPaise, rate, body.tenureMonths, firstDue);
    const fee = Math.round((body.principalPaise * lender.feeBps) / 10_000);
    const stepDown = product.stepDown?.map((s) => ({ afterOnTimePayments: s.afterOnTimePayments, ratePaBps: lender.ratePaBps + s.offsetBps - discount }));
    const app = await db.loanApplication.create({
      data: {
        lenderId: lender.id,
        quoteRef: `q_${crypto.randomUUID()}`,
        kind: body.kind,
        principalPaise: body.principalPaise,
        tenureMonths: body.tenureMonths,
        ratePaBps: rate,
        feeBps: lender.feeBps,
        quoteJson: '{}',
        clientRef: body.clientRef,
        incomeVerified: body.incomeVerified,
      },
    });
    const quote = LoanQuote.parse({
      quoteRef: app.quoteRef,
      lenderName: lender.name,
      kind: body.kind,
      principalPaise: body.principalPaise,
      tenureMonths: body.tenureMonths,
      ratePaBps: rate,
      feeBps: lender.feeBps,
      processingFeePaise: fee,
      gstOnFeePaise: Math.round(fee * 0.18),
      emiPaise: sched[0]!.amountPaise,
      totalInterestPaise: sched.reduce((a, i) => a + i.interestPaise, 0),
      schedule: sched,
      ...(stepDown ? { rateStepDown: stepDown } : {}),
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
    if (app.incomeVerified && body.verifiedMonthlyIncomePaise === null) {
      throw new HttpError(422, 'income_not_verified', 'This price was for a verified salary; please verify your salary again.');
    }
    let collateral: Collateral | null = null;
    if (app.kind === 'loan_against_funds') {
      if (!body.collateral) throw new HttpError(422, 'collateral_required', 'A loan against holdings needs something pledged');
      collateral = await valueCollateral(person.id, body.collateral);
      const max = Math.floor((collateral.valuePaise * LENDER_MAX_LTV_BPS[collateral.assetClass]) / 10_000);
      if (app.principalPaise > max) {
        const lender = await db.lender.findUniqueOrThrow({ where: { id: app.lenderId } });
        throw new HttpError(422, 'above_ltv', `${lender.name} lends up to ${Math.round(LENDER_MAX_LTV_BPS[collateral.assetClass] / 100)}% of what you pledge`);
      }
    }
    const otp = demoCode();
    await db.loanApplication.update({
      where: { id: app.id },
      data: {
        personId: person.id,
        status: 'applied',
        kfsAcknowledgedAt: new Date(body.kfsAcknowledgedAt),
        clientRef: body.clientRef,
        otp,
        verifiedIncomePaise: body.verifiedMonthlyIncomePaise,
        collateralJson: collateral ? JSON.stringify(collateral) : null,
      },
    });
    return { applicationRef: app.id, status: 'applied' as const, otpSentTo: maskPhone(person.phone), demoOtp: otp };
  });

  /** The lender values what is pledged itself, from the fund house and its own records. */
  async function valueCollateral(personId: string, c: { kind: Collateral['kind']; ref: string; schemeCode: string | null; units: number | null; valuePaise: number }): Promise<Collateral> {
    if (c.kind === 'mutual_fund') {
      const holding = await db.fundHolding.findFirst({ where: { personId, folio: c.ref, scheme: { code: c.schemeCode ?? '' } }, include: { scheme: true, liens: { where: { status: 'marked' } } } });
      if (!holding) throw new HttpError(422, 'collateral_not_found', 'The fund house has no such holding');
      const free = holding.units - holding.liens.reduce((a, l) => a + l.units, 0);
      const units = Math.min(free, c.units ?? free);
      return { kind: 'mutual_fund', ref: c.ref, schemeCode: holding.scheme.code, units, valuePaise: Math.round(units * holding.scheme.navPaise), assetClass: holding.scheme.category as Collateral['assetClass'] };
    }
    if (c.kind === 'fixed_deposit') {
      const fd = await db.fixedDeposit.findFirst({ where: { personId, id: c.ref } });
      if (!fd) throw new HttpError(422, 'collateral_not_found', 'The bank has no such deposit');
      return { kind: 'fixed_deposit', ref: c.ref, schemeCode: null, units: null, valuePaise: fd.principalPaise, assetClass: 'fixed_deposit' };
    }
    // Gold is pledged physically; the lender appraises it at the declared value
    return { kind: 'gold', ref: c.ref, schemeCode: null, units: c.units, valuePaise: c.valuePaise, assetClass: 'gold' };
  }

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

    const disbursedAt = await simNow(db);
    const loan = await db.loanAccount.create({ data: { applicationId: app.id, disbursedAt, scheduleJson: JSON.stringify(quote.schedule), ratePaBps: app.ratePaBps } });
    await db.loanApplication.update({ where: { id: app.id }, data: { status: 'disbursed' } });
    const card = await db.creditCardAccount.findFirst({ where: { personId: app.personId } });
    const account = await db.bankAccount.findFirst({ where: { personId: app.personId } });

    if (app.kind === 'purchase_emi' && card) {
      // The lender pays the purchase off the card; the card shows a credit
      await db.$transaction([
        db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: Math.max(0, card.outstandingPaise - app.principalPaise) } }),
        db.cardCharge.create({ data: { cardAccountId: card.id, merchant: `EMI conversion · ${quote.lenderName}`, category: 'other', amountPaise: -app.principalPaise, postedAt: disbursedAt } }),
      ]);
    } else if (app.kind === 'balance_switch_emi' && card) {
      // The lender clears the carried balance on the latest bill
      const statement = await db.cardStatement.findFirst({ where: { cardAccountId: card.id }, orderBy: { periodEnd: 'desc' } });
      if (statement) {
        const onTime = disbursedAt.toISOString().slice(0, 10) <= statement.dueDate;
        const [payment, , updated] = await db.$transaction([
          db.cardPayment.create({ data: { statementId: statement.id, amountPaise: app.principalPaise, receivedAt: disbursedAt, onTime, clientRef: `lender:${app.id}` } }),
          db.cardStatement.update({ where: { id: statement.id }, data: { paidPaise: { increment: app.principalPaise } } }),
          db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: Math.max(0, card.outstandingPaise - app.principalPaise) } }),
        ]);
        await ctx.outbox.emit('bank.card.payment.received', {
          customerRef: card.personId,
          cardRef: card.id,
          statementRef: statement.id,
          paymentRef: payment.id,
          amountPaise: app.principalPaise,
          receivedAt: disbursedAt.toISOString(),
          onTime,
          outstandingPaise: updated.outstandingPaise,
          paidBy: 'lender',
        });
      }
    } else if (account) {
      // Personal loan, or loan against holdings: money lands in the bank account
      if (app.kind === 'loan_against_funds' && app.collateralJson) {
        const c = JSON.parse(app.collateralJson) as Collateral;
        if (c.kind === 'mutual_fund' && c.units) {
          const holding = await db.fundHolding.findFirst({ where: { personId: app.personId, folio: c.ref, scheme: { code: c.schemeCode ?? '' } } });
          if (holding) await db.lien.create({ data: { holdingId: holding.id, units: c.units, lenderApplicationRef: app.id, status: 'marked' } });
        }
      }
      await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: app.principalPaise } } });
      await db.bankTxn.create({ data: { accountId: account.id, kind: 'credit', amountPaise: app.principalPaise, narration: `LOAN DISBURSAL ${quote.lenderName.toUpperCase()}`, at: disbursedAt } });
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

/**
 * Month-end at the lender: collect EMIs due by `to` from the borrower's bank
 * account, and re-price a balance switch when it reaches an on-time step.
 */
export async function collectEmis(ctx: Ctx, to: string): Promise<number> {
  const { db } = ctx;
  let events = 0;
  const loans = await db.loanAccount.findMany({ include: { application: { include: { lender: true } } } });
  for (const loan of loans) {
    const app = loan.application;
    if (!app.personId || app.status !== 'disbursed') continue;
    let sched = JSON.parse(loan.scheduleJson) as EmiInstallment[];
    const account = await db.bankAccount.findFirst({ where: { personId: app.personId } });
    let { paidCount, onTimeCount, ratePaBps } = loan;
    for (const inst of sched.filter((i) => i.status !== 'paid' && i.dueDate <= to)) {
      const onTime = !!account && account.balancePaise >= inst.amountPaise;
      if (account) {
        await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { decrement: inst.amountPaise } } });
        account.balancePaise -= inst.amountPaise;
        await db.bankTxn.create({ data: { accountId: account.id, kind: 'emi', amountPaise: -inst.amountPaise, narration: `EMI ${inst.n} ${app.lender.name.toUpperCase()}`, at: new Date(`${inst.dueDate}T10:00:00+05:30`) } });
      }
      inst.status = 'paid';
      paidCount += 1;
      if (onTime) onTimeCount += 1;
      await ctx.outbox.emit('lender.emi.collected', { loanRef: loan.id, clientRef: app.clientRef, n: inst.n, amountPaise: inst.amountPaise, onTime });
      events += 1;

      // Rate step-down for on-time payments: re-price what's left
      const quote = LoanQuote.parse(JSON.parse(app.quoteJson));
      const step = quote.rateStepDown?.find((s) => s.afterOnTimePayments === onTimeCount && onTime);
      const left = sched.filter((i) => i.status !== 'paid');
      if (step && left.length && step.ratePaBps < ratePaBps) {
        ratePaBps = step.ratePaBps;
        const remainingPrincipal = left.reduce((a, i) => a + i.principalPaise, 0);
        const repriced = schedule(remainingPrincipal, ratePaBps, left.length, left[0]!.dueDate, left[0]!.n);
        sched = [...sched.filter((i) => i.status === 'paid'), ...repriced];
        await ctx.outbox.emit('lender.loan.repriced', { loanRef: loan.id, clientRef: app.clientRef, ratePaBps, afterOnTimePayments: onTimeCount, remaining: repriced });
        events += 1;
      }
    }
    if (paidCount !== loan.paidCount) {
      await db.loanAccount.update({ where: { id: loan.id }, data: { scheduleJson: JSON.stringify(sched), paidCount, onTimeCount, ratePaBps } });
      if (sched.every((i) => i.status === 'paid')) {
        await db.loanApplication.update({ where: { id: app.id }, data: { status: 'closed' } });
        await db.lien.updateMany({ where: { lenderApplicationRef: app.id }, data: { status: 'released' } });
      }
    }
  }
  return events;
}

/** After a market move: re-value pledged funds and tell the borrower's app how the loan now compares. */
export async function revalueCollateral(ctx: Ctx): Promise<number> {
  const { db } = ctx;
  let events = 0;
  const apps = await db.loanApplication.findMany({ where: { kind: 'loan_against_funds', status: 'disbursed' }, include: { loan: true } });
  for (const app of apps) {
    if (!app.loan || !app.collateralJson) continue;
    const c = JSON.parse(app.collateralJson) as Collateral;
    let value = c.valuePaise;
    if (c.kind === 'mutual_fund' && c.schemeCode && c.units) {
      const scheme = await db.scheme.findUnique({ where: { code: c.schemeCode } });
      if (scheme) value = Math.round(c.units * scheme.navPaise);
    }
    const sched = JSON.parse(app.loan.scheduleJson) as EmiInstallment[];
    const outstanding = sched.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.principalPaise, 0);
    const max = LENDER_MAX_LTV_BPS[c.assetClass];
    const ltv = value ? Math.round((outstanding * 10_000) / value) : 10_000;
    await ctx.outbox.emit('lender.collateral.alert', {
      loanRef: app.loan.id,
      clientRef: app.clientRef,
      collateralValuePaise: value,
      outstandingPaise: outstanding,
      loanToValueBps: ltv,
      maxLoanToValueBps: max,
      topUpNeededPaise: Math.max(0, outstanding - Math.floor((value * max) / 10_000)),
    });
    events += 1;
  }
  return events;
}
