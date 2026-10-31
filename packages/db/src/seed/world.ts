import { CARD_INTEREST_MONTHLY_BPS, GST_BPS } from '@cred/engine';
import { personaByKey, SIM_START_DATE, type DemoPersona, type TxnCategory } from '@cred/types';
import { SPEND_MERCHANTS } from './catalog';
import type { PayPlan, PersonaFixture } from './personas';
import { addDays, addMonths, at, daysBetween, parseYmd, prng, rupees, ymd } from './util';

export interface WorldStatement {
  id: string;
  cycle: number;
  periodStart: string;
  periodEnd: string;
  totalDuePaise: number;
  minDuePaise: number;
  paidPaise: number;
  dueDate: string;
  status: 'paid' | 'partial' | 'open';
  payment: { id: string; kind: 'full' | 'minimum' | 'custom'; amountPaise: number; paidAt: Date; onTime: boolean } | null;
}

export interface WorldCharge {
  id: string;
  statementId: string | null;
  cycle: number;
  merchant: string;
  category: TxnCategory;
  amountPaise: number;
  postedAt: Date;
}

export interface PersonaWorld {
  fixture: PersonaFixture;
  persona: DemoPersona;
  ids: { person: string; card: string; cardToken: string; account: string; member: string };
  statements: WorldStatement[];
  charges: WorldCharge[];
  outstandingPaise: number;
  onTimeStreak: number;
  bankTxns: { kind: 'salary' | 'debit' | 'credit' | 'card_payment'; amountPaise: number; narration: string; at: Date }[];
  stepDays: { date: string; steps: number }[];
  /** Past UPI payments made from the CRED app. */
  upiPayments: { id: string; payeeVpa: string; payeeName: string; amountPaise: number; note: string | null; at: Date; rrn: string }[];
}

const roundUpToRupee = (paise: number) => Math.ceil(paise / 100) * 100;

function minimumDue(totalPaise: number): number {
  if (totalPaise <= 0) return 0;
  return Math.min(totalPaise, Math.max(roundUpToRupee(totalPaise * 0.05), rupees(200)));
}

function paidFor(plan: PayPlan, total: number, min: number): { amount: number; kind: 'full' | 'minimum' | 'custom' } {
  if (plan === 'full') return { amount: total, kind: 'full' };
  if (plan === 'minimum') return { amount: min, kind: 'minimum' };
  return { amount: Math.max(min, roundUpToRupee((total * plan.pct) / 100)), kind: 'custom' };
}

/** Latest statement close: the most recent billing day before sim start. */
function latestPeriodEnd(billingDay: number): string {
  const { y, m, d } = parseYmd(SIM_START_DATE);
  return d > billingDay ? ymd(y, m, billingDay) : ymd(y, m - 1, billingDay);
}

function pickMerchant(rand: () => number) {
  const total = SPEND_MERCHANTS.reduce((a, m) => a + m.weight, 0);
  let r = rand() * total;
  for (const m of SPEND_MERCHANTS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return SPEND_MERCHANTS[0]!;
}

function spendCharges(
  rand: () => number,
  key: string,
  cycle: number,
  statementId: string | null,
  from: string,
  days: number,
  budgetPaise: number,
): WorldCharge[] {
  const count = 6 + Math.floor(rand() * 6);
  const weights = Array.from({ length: count }, () => 0.3 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, j) => {
    const m = pickMerchant(rand);
    const day = Math.min(days - 1, Math.floor(rand() * days));
    return {
      id: `ch_${key}_${cycle}_${j}`,
      statementId,
      cycle,
      merchant: m.merchant,
      category: m.category,
      amountPaise: Math.max(rupees(49), Math.round(((budgetPaise * w) / sum) / 100) * 100),
      postedAt: at(addDays(from, day), 9 + Math.floor(rand() * 12), Math.floor(rand() * 60)),
    };
  });
}

export function buildPersonaWorld(fixture: PersonaFixture): PersonaWorld {
  const persona = personaByKey(fixture.key);
  const key = fixture.key;
  const rand = prng(`world:${key}`);
  const { card } = fixture;
  const H = card.history.length;
  const lastEnd = latestPeriodEnd(card.billingDay);

  const statements: WorldStatement[] = [];
  const charges: WorldCharge[] = [];
  let carry = card.openingCarryPaise ?? 0;
  let streak = 0;

  for (let i = 0; i <= H; i++) {
    const periodEnd = addMonths(lastEnd, i - H);
    const periodStart = addDays(addMonths(periodEnd, -1), 1);
    const { y, m } = parseYmd(periodEnd);
    const dueDate = ymd(y, m + 1, card.dueDay);
    const id = `st_${key}_${periodEnd}`;

    const budget = Math.round(card.monthlySpendPaise * (0.85 + rand() * 0.3));
    const cycleCharges = spendCharges(rand, key, i, id, periodStart, daysBetween(periodStart, periodEnd) + 1, budget);
    for (const o of card.oneOffs?.filter((x) => x.cycle === i) ?? []) {
      cycleCharges.push({
        id: `ch_${key}_${i}_oneoff`,
        statementId: id,
        cycle: i,
        merchant: o.merchant,
        category: o.category,
        amountPaise: o.amountPaise,
        postedAt: at(addDays(periodStart, 10), 18),
      });
    }
    charges.push(...cycleCharges);

    const spend = cycleCharges.reduce((a, c) => a + c.amountPaise, 0);
    const interest = carry > 0 ? Math.round((carry * CARD_INTEREST_MONTHLY_BPS) / 10_000) : 0;
    const gst = Math.round((interest * GST_BPS) / 10_000);
    const total = carry + interest + gst + spend;
    const min = minimumDue(total);

    const plan = card.history[i];
    if (plan === undefined) {
      statements.push({ id, cycle: i, periodStart, periodEnd, totalDuePaise: total, minDuePaise: min, paidPaise: 0, dueDate, status: 'open', payment: null });
      carry = total;
      continue;
    }
    const pay = paidFor(plan, total, min);
    statements.push({
      id,
      cycle: i,
      periodStart,
      periodEnd,
      totalDuePaise: total,
      minDuePaise: min,
      paidPaise: pay.amount,
      dueDate,
      status: pay.amount >= total ? 'paid' : 'partial',
      payment: { id: `cp_${key}_${i}`, kind: pay.kind, amountPaise: pay.amount, paidAt: at(addDays(dueDate, -2), 20), onTime: true },
    });
    streak = pay.kind === 'full' ? streak + 1 : 0;
    carry = total - pay.amount;
  }

  // Unbilled spend since the last statement closed
  const unbilledFrom = addDays(lastEnd, 1);
  const unbilledDays = daysBetween(unbilledFrom, SIM_START_DATE);
  const unbilled = spendCharges(rand, key, H + 1, null, unbilledFrom, unbilledDays, Math.round((card.monthlySpendPaise * unbilledDays) / 30));
  charges.push(...unbilled);
  const outstandingPaise = carry + unbilled.reduce((a, c) => a + c.amountPaise, 0);

  // Six months of salary credits and everyday debits
  const bankTxns: PersonaWorld['bankTxns'] = [];
  for (let k = 5; k >= 0; k--) {
    const month = addMonths(SIM_START_DATE.slice(0, 8) + '01', -k);
    bankTxns.push({ kind: 'salary', amountPaise: fixture.salaryPaise, narration: `SALARY ${fixture.employer.toUpperCase()}`, at: at(month, 9) });
    bankTxns.push({ kind: 'debit', amountPaise: -Math.round(fixture.salaryPaise * (0.25 + rand() * 0.1)), narration: 'RENT / HOUSING', at: at(addDays(month, 4), 11) });
    bankTxns.push({ kind: 'debit', amountPaise: -Math.round(fixture.salaryPaise * (0.1 + rand() * 0.1)), narration: 'UPI / EVERYDAY SPENDS', at: at(addDays(month, 12), 19) });
  }
  for (const s of statements) {
    if (s.payment) bankTxns.push({ kind: 'card_payment', amountPaise: -s.payment.amountPaise, narration: `MOCK BANK CARD XX${card.last4}`, at: s.payment.paidAt });
  }
  bankTxns.sort((a, b) => a.at.getTime() - b.at.getTime());

  const stepDays = fixture.wearable
    ? Array.from({ length: 28 }, (_, d) => ({
        date: addDays(SIM_START_DATE, d - 28),
        steps: Math.round(fixture.behaviour.avgDailySteps * (0.6 + rand() * 0.8)),
      }))
    : [];

  const upiPicks = [
    { payeeVpa: 'ramesh.tea@mockbank', payeeName: 'Ramesh Tea Stall', min: 40, max: 160, note: 'Chai' },
    { payeeVpa: 'freshbasket@mockbank', payeeName: 'FreshBasket Groceries', min: 900, max: 2_800, note: 'Groceries' },
    { payeeVpa: 'meera.joshi@mockbank', payeeName: 'Meera Joshi', min: 300, max: 1_500, note: 'Dinner split' },
  ];
  const upiPayments = upiPicks.map((u, i) => ({
    id: `upi_${key}_${i}`,
    payeeVpa: u.payeeVpa,
    payeeName: u.payeeName,
    amountPaise: rupees(Math.round(u.min + rand() * (u.max - u.min))),
    note: u.note,
    at: at(addDays(SIM_START_DATE, -(i * 3 + 1)), 10 + i * 3, 15),
    rrn: String(600_000_000_000 + Math.floor(rand() * 99_999_999_999)),
  }));

  return {
    upiPayments,
    fixture,
    persona,
    ids: { person: `per_${key}`, card: `cc_${key}`, cardToken: `tok_${key}_${card.last4}`, account: `acc_${key}`, member: `mem_${key}` },
    statements,
    charges,
    outstandingPaise,
    onTimeStreak: streak,
    bankTxns,
    stepDays,
  };
}
