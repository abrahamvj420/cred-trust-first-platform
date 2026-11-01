import { catalog, prng } from '@cred/db/seed';
import { handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi, personaByKey, TxnCategory, WORLD_SCENARIOS, type Scenario } from '@cred/types';
import { approveConsent, notifyFiReady } from './aa';
import { addMonthsYmd, simDate, simNow, type Ctx } from './context';
import { dealerMotorPolicy, progressClaim, renewals } from './insurer';
import { collectEmis, revalueCollateral } from './lender';
import { sendSummaries } from './wearable';

/**
 * The world clock. Advancing a month plays out what each institution does in
 * that month, in date order, and reports it to CRED by signed webhook: salary
 * credits, everyday card spend, each persona's scripted bill payment, statement
 * close (with interest on anything carried), EMI collection, weekly activity
 * summaries, renewal notices, claim progress and fund NAVs. Last comes
 * `sim.clock.advanced`, on which CRED applies due dates.
 */
const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const at = (ymd: string, hour = 12) => new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00+05:30`);
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

const CARD_INTEREST_BPS = 350;
const GST_BPS = 1800;
const SPEND_DAYS = [3, 10, 18, 25];
const minimumDue = (total: number) => (total <= 0 ? 0 : Math.min(total, Math.max(Math.ceil((total * 0.05) / 100) * 100, 200_00)));

type CardRow = { id: string; personId: string; limitPaise: number; outstandingPaise: number; billingDay: number; dueDay: number };

/** A card charge at the bank, reported to CRED. */
async function postCharge(ctx: Ctx, card: CardRow, merchant: string, category: TxnCategory, amountPaise: number, postedAt: Date): Promise<boolean> {
  const { db } = ctx;
  const fresh = await db.creditCardAccount.findUniqueOrThrow({ where: { id: card.id } });
  if (amountPaise > fresh.limitPaise - fresh.outstandingPaise) return false; // declined: over the limit
  const [charge, updated] = await db.$transaction([
    db.cardCharge.create({ data: { cardAccountId: card.id, merchant, category, amountPaise, postedAt } }),
    db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: { increment: amountPaise } } }),
  ]);
  await ctx.outbox.emit('bank.card.transaction.posted', {
    customerRef: card.personId,
    cardRef: card.id,
    transactionRef: charge.id,
    merchant,
    category,
    amountPaise,
    postedAt: postedAt.toISOString(),
    outstandingPaise: updated.outstandingPaise,
    limitPaise: updated.limitPaise,
  });
  return true;
}

/** The persona's own habit pays the bill from their bank, unless they already paid something this cycle themselves. */
async function scriptedPayment(ctx: Ctx, card: CardRow, habit: string, day: string): Promise<number> {
  const { db } = ctx;
  const statement = await db.cardStatement.findFirst({ where: { cardAccountId: card.id, dueDate: addDays(day, 2) }, include: { payments: true } });
  if (!statement || statement.payments.length) return 0;
  const remaining = statement.totalDuePaise - statement.paidPaise;
  if (remaining <= 0) return 0;
  const account = await db.bankAccount.findFirst({ where: { personId: card.personId } });
  if (!account) return 0;
  const pct = habit.startsWith('partial_pct:') ? Number(habit.split(':')[1]) : null;
  let amount = habit === 'full' ? remaining : habit === 'minimum' ? statement.minDuePaise : Math.max(statement.minDuePaise, Math.ceil((statement.totalDuePaise * (pct ?? 100)) / 100 / 100) * 100);
  amount = Math.min(amount, remaining);
  // Short of cash: pay what the account allows (keeping ₹5,000 for the month), never below the minimum
  if (account.balancePaise < amount) {
    const affordable = Math.floor((account.balancePaise - 5_000_00) / 100) * 100;
    amount = affordable >= statement.minDuePaise ? affordable : account.balancePaise >= statement.minDuePaise ? statement.minDuePaise : 0;
  }
  if (amount <= 0) return 0; // can't pay: the bill will be missed
  const receivedAt = at(day, 20);
  const fresh = await db.creditCardAccount.findUniqueOrThrow({ where: { id: card.id } });
  const [payment, , updated] = await db.$transaction([
    db.cardPayment.create({ data: { statementId: statement.id, amountPaise: amount, receivedAt, onTime: true, clientRef: null } }),
    db.cardStatement.update({ where: { id: statement.id }, data: { paidPaise: { increment: amount } } }),
    db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: Math.max(0, fresh.outstandingPaise - amount) } }),
    db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { decrement: amount } } }),
    db.bankTxn.create({ data: { accountId: account.id, kind: 'card_payment', amountPaise: -amount, narration: 'CARD BILL STANDING INSTRUCTION', at: receivedAt } }),
  ]);
  await ctx.outbox.emit('bank.card.payment.received', {
    customerRef: card.personId,
    cardRef: card.id,
    statementRef: statement.id,
    paymentRef: payment.id,
    amountPaise: amount,
    receivedAt: receivedAt.toISOString(),
    onTime: true,
    outstandingPaise: updated.outstandingPaise,
    paidBy: 'bank_autopay',
  });
  return 1;
}

/** Billing day: close the statement. Anything left unpaid after the last due date carries, with interest and GST. */
async function closeStatement(ctx: Ctx, card: CardRow, day: string): Promise<number> {
  const { db } = ctx;
  const prev = await db.cardStatement.findFirst({ where: { cardAccountId: card.id }, orderBy: { periodEnd: 'desc' } });
  if (prev && prev.periodEnd >= day) return 0;
  const periodStart = prev ? addDays(prev.periodEnd, 1) : addDays(day, -30);
  const carry = prev ? Math.max(0, prev.totalDuePaise - prev.paidPaise) : 0;
  const interest = Math.round((carry * CARD_INTEREST_BPS) / 10_000);
  const gst = Math.round((interest * GST_BPS) / 10_000);
  const charges = await db.cardCharge.findMany({ where: { cardAccountId: card.id, statementId: null, postedAt: { lte: at(day, 23) } } });
  const spend = charges.reduce((a, c) => a + c.amountPaise, 0);
  const total = Math.max(0, carry + interest + gst + spend);
  const [y, m] = day.split('-').map(Number) as [number, number];
  const statement = await db.cardStatement.create({
    data: { cardAccountId: card.id, periodStart, periodEnd: day, totalDuePaise: total, minDuePaise: minimumDue(total), dueDate: ymd(y, m + 1, card.dueDay), interestPaise: interest + gst },
  });
  await db.cardCharge.updateMany({ where: { id: { in: charges.map((c) => c.id) } }, data: { statementId: statement.id } });
  const updated = await db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: { increment: interest + gst } } });
  await ctx.outbox.emit('bank.card.statement.generated', {
    customerRef: card.personId,
    cardRef: card.id,
    statementRef: statement.id,
    periodStart,
    periodEnd: day,
    totalDuePaise: total,
    minDuePaise: statement.minDuePaise,
    dueDate: statement.dueDate,
    outstandingPaise: updated.outstandingPaise,
    interestPaise: interest + gst,
  });
  return 1;
}

export async function advanceOneMonth(ctx: Ctx): Promise<{ from: string; to: string; events: number }> {
  const { db } = ctx;
  const from = await simDate(db);
  const to = addMonthsYmd(from, 1);
  let events = 0;
  const people = await db.person.findMany({ include: { behaviour: true, bankAccounts: true, cardAccounts: true }, orderBy: { personaKey: 'asc' } });

  for (const p of people) {
    const account = p.bankAccounts[0];
    const card = p.cardAccounts[0];
    const b = p.behaviour;
    const rand = prng(`month:${p.id}:${to}`);
    for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
      const dom = Number(d.slice(8));
      if (account && b) {
        const move = async (amountPaise: number, kind: string, narration: string) => {
          // Nobody spends money they don't have: skip a debit the account can't cover
          if (amountPaise < 0) {
            const fresh = await db.bankAccount.findUniqueOrThrow({ where: { id: account.id } });
            if (fresh.balancePaise < -amountPaise) return;
          }
          await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: amountPaise } } });
          await db.bankTxn.create({ data: { accountId: account.id, kind, amountPaise, narration, at: at(d, 9) } });
        };
        // Salary on the 1st. After a cash crunch the next one is held (stored as a negative delay) and paid that many days late.
        const fresh = await db.personaBehaviour.findUniqueOrThrow({ where: { personId: p.id } });
        if (dom === 1 && fresh.salaryDelayDays > 0) {
          await db.personaBehaviour.update({ where: { personId: p.id }, data: { salaryDelayDays: -fresh.salaryDelayDays } });
        } else if (dom === 1 && fresh.salaryDelayDays === 0) {
          await move(b.salaryPaise, 'salary', `SALARY ${(p.employer ?? 'EMPLOYER').toUpperCase()}`);
        } else if (fresh.salaryDelayDays < 0 && dom === 1 - fresh.salaryDelayDays) {
          await move(b.salaryPaise, 'salary', `SALARY ${(p.employer ?? 'EMPLOYER').toUpperCase()} (LATE)`);
          await db.personaBehaviour.update({ where: { personId: p.id }, data: { salaryDelayDays: 0 } });
        }
        if (dom === 5) await move(-Math.round(b.salaryPaise * 0.3), 'debit', 'RENT / HOUSING');
        if (dom === 13) await move(-Math.round(b.salaryPaise * 0.15), 'debit', 'UPI / EVERYDAY SPENDS');
      }
      if (!card) continue;
      if (b && SPEND_DAYS.includes(dom)) {
        const m = catalog.SPEND_MERCHANTS[Math.floor(rand() * catalog.SPEND_MERCHANTS.length)]!;
        const amount = Math.round(((b.monthlySpendPaise / SPEND_DAYS.length) * (0.7 + rand() * 0.6)) / 100) * 100;
        if (await postCharge(ctx, card, m.merchant, m.category, amount, at(d, 10 + Math.floor(rand() * 10)))) events += 1;
      }
      if (b) events += await scriptedPayment(ctx, card, b.billPayHabit, d);
      if (dom === card.billingDay) events += await closeStatement(ctx, card, d);
    }
    events += await sendSummaries(ctx, p.id, from, to);
  }

  events += await collectEmis(ctx, to);
  events += await renewals(ctx, to);
  for (const c of await db.insuranceClaim.findMany({ where: { status: { notIn: ['settled', 'rejected'] } } })) if (await progressClaim(ctx, c.id)) events += 1;
  // Funds grow by their expected return, a month at a time
  for (const s of await db.scheme.findMany()) await db.scheme.update({ where: { id: s.id }, data: { navPaise: Math.round(s.navPaise * (1 + s.expectedReturnBps / 10_000 / 12)) } });
  events += await notifyFiReady(ctx, 'MUTUAL_FUNDS');

  await db.simClock.update({ where: { id: 1 }, data: { currentDate: to } });
  await ctx.outbox.emit('sim.clock.advanced', { from, to });
  return { from, to, events: events + 1 };
}

const SCENARIO_NOTES: Record<Scenario, string> = {
  big_purchase: 'A ₹1,50,000 laptop bought at ShopKart on the card.',
  insurer_renewal: 'The insurer sent renewal notices for policies bought through CRED.',
  wearable_sync: 'The health app sent the last four weekly activity summaries.',
  market_fall: 'Equity fund NAVs fell 15%. The AA flagged new data; lenders re-valued pledged funds.',
  new_vehicle: 'A new car from Velocity Motors: booking paid on the card, with the cover the dealer sold.',
  claim_update: 'The insurer moved the latest open claim one step.',
  cash_crunch: 'An emergency hospital bill was paid from the bank account and this month’s salary is 10 days late: the next EMI will bounce.',
  partial_bill_payment: 'A member action: pay part of the bill in the CRED app.',
  fund_sale: 'A member action: start selling a fund in the CRED app.',
};

export function simHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.sim.advance, async ({ body }) => {
    const from = await simDate(db);
    let events = 0;
    let to = from;
    for (let i = 0; i < body.months; i++) {
      const r = await advanceOneMonth(ctx);
      events += r.events;
      to = r.to;
    }
    return { from, to, eventsEmitted: events };
  });

  h.on(ecosystemApi.sim.outbox, async () => ({ pending: await db.webhookOutbox.count({ where: { status: 'pending' } }) }));

  /** The control room acting as the member on SimAA's page: approve pending requests, sharing every account offered. */
  h.on(ecosystemApi.sim.approveConsents, async ({ body }) => {
    const person = await db.person.findUnique({ where: { personaKey: body.personaKey } });
    if (!person) throw notFound('Persona');
    let approved = 0;
    for (const c of await db.aaConsentRequest.findMany({ where: { personId: person.id, status: 'PENDING' } })) {
      await approveConsent(ctx, c.consentHandle);
      approved += 1;
    }
    return { approved };
  });

  h.on(ecosystemApi.sim.scenario, async ({ body }) => {
    if (!(WORLD_SCENARIOS as readonly string[]).includes(body.scenario)) {
      throw new HttpError(422, 'member_action', `${SCENARIO_NOTES[body.scenario]} The outside world can’t do it for them.`);
    }
    const person = await db.person.findUnique({ where: { personaKey: body.personaKey }, include: { cardAccounts: true } });
    if (!person) throw notFound('Persona');
    const today = await simDate(db);
    const card = person.cardAccounts[0];
    let events = 0;
    switch (body.scenario) {
      case 'big_purchase':
        if (card && (await postCharge(ctx, card, catalog.SHOPKART.name, 'electronics', 1_50_000_00, new Date()))) events += 1;
        break;
      case 'insurer_renewal':
        events += await renewals(ctx, today, { personId: person.id, force: true });
        break;
      case 'wearable_sync':
        events += await sendSummaries(ctx, person.id, addDays(today, -28), today);
        break;
      case 'market_fall':
        for (const s of await db.scheme.findMany({ where: { category: { in: ['equity', 'hybrid'] } } })) {
          await db.scheme.update({ where: { id: s.id }, data: { navPaise: Math.round(s.navPaise * 0.85) } });
        }
        events += await notifyFiReady(ctx, 'MUTUAL_FUNDS');
        events += await revalueCollateral(ctx);
        break;
      case 'new_vehicle': {
        const v = catalog.NEW_VEHICLE;
        await dealerMotorPolicy(ctx, person.id, { registration: v.registration, makeModel: v.makeModel, year: v.year, idvPaise: v.idvPaise }, body.dealerCover);
        events += await notifyFiReady(ctx, 'INSURANCE_POLICIES', person.id);
        if (card && (await postCharge(ctx, card, v.dealer, 'automobile', v.bookingPaise, new Date()))) events += 1;
        break;
      }
      case 'cash_crunch': {
        const account = await db.bankAccount.findFirst({ where: { personId: person.id } });
        if (!account) throw notFound('Bank account');
        const bill = Math.max(0, account.balancePaise - 1_000_00);
        if (bill > 0) {
          await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { decrement: bill } } });
          await db.bankTxn.create({ data: { accountId: account.id, kind: 'debit', amountPaise: -bill, narration: 'CITY HOSPITAL EMERGENCY', at: await simNow(db) } });
        }
        await db.personaBehaviour.update({ where: { personId: person.id }, data: { salaryDelayDays: 10 } });
        break;
      }
      case 'claim_update': {
        const claim = await db.insuranceClaim.findFirst({ where: { policy: { personId: person.id }, status: { notIn: ['settled', 'rejected'] } }, orderBy: { createdAt: 'desc' } });
        if (!claim) throw new HttpError(422, 'no_open_claim', `${personaByKey(body.personaKey).name} has no open claim`);
        if (await progressClaim(ctx, claim.id)) events += 1;
        break;
      }
    }
    return { scenario: body.scenario, personaKey: body.personaKey, eventsEmitted: events, note: SCENARIO_NOTES[body.scenario] };
  });
}
