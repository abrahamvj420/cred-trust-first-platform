import { CARD_INTEREST_MONTHLY_BPS, GST_BPS, PROCESSING_FEE_BPS } from './constants';

/**
 * Savings method (CLAUDE.md → "Savings method"). Every screen uses these
 * functions; nothing else in the codebase may compute card-vs-EMI costs.
 * All inputs and outputs are integer paise.
 */

export interface Installment {
  n: number;
  paymentPaise: number;
  principalPaise: number;
  interestPaise: number;
  balanceAfterPaise: number;
}

const bpsOf = (paise: number, bps: number) => Math.round((paise * bps) / 10_000);

/** Equal monthly payments on a reducing balance. The last payment absorbs rounding. */
export function amortise(principalPaise: number, monthlyRate: number, months: number): Installment[] {
  if (!Number.isInteger(principalPaise) || principalPaise <= 0) throw new Error('principal must be positive paise');
  if (!Number.isInteger(months) || months <= 0) throw new Error('months must be a positive integer');
  const payment =
    monthlyRate === 0
      ? Math.round(principalPaise / months)
      : Math.round((principalPaise * monthlyRate) / (1 - (1 + monthlyRate) ** -months));

  const out: Installment[] = [];
  let balance = principalPaise;
  for (let n = 1; n <= months; n++) {
    const interest = Math.round(balance * monthlyRate);
    const principal = n === months ? balance : payment - interest;
    balance -= principal;
    out.push({ n, paymentPaise: principal + interest, principalPaise: principal, interestPaise: interest, balanceAfterPaise: balance });
  }
  return out;
}

const sumInterest = (s: Installment[]) => s.reduce((acc, i) => acc + i.interestPaise, 0);

export interface CardCost {
  interestPaise: number;
  gstOnInterestPaise: number;
  totalCostPaise: number;
  schedule: Installment[];
}

/** Keeping the balance on the card: 3.5%/month reducing, plus 18% GST on interest. */
export function cardCost(principalPaise: number, months: number): CardCost {
  const schedule = amortise(principalPaise, CARD_INTEREST_MONTHLY_BPS / 10_000, months);
  const interestPaise = sumInterest(schedule);
  const gstOnInterestPaise = bpsOf(interestPaise, GST_BPS);
  return { interestPaise, gstOnInterestPaise, totalCostPaise: interestPaise + gstOnInterestPaise, schedule };
}

export interface EmiCost {
  ratePaBps: number;
  emiPaise: number;
  interestPaise: number;
  processingFeePaise: number;
  gstOnFeePaise: number;
  totalCostPaise: number;
  schedule: Installment[];
}

/** Partner EMI: reducing balance at annual rate ÷ 12, 1% fee + 18% GST on the fee. */
export function emiCost(principalPaise: number, months: number, ratePaBps: number, feeBps: number = PROCESSING_FEE_BPS): EmiCost {
  const schedule = amortise(principalPaise, ratePaBps / 10_000 / 12, months);
  const interestPaise = sumInterest(schedule);
  const processingFeePaise = bpsOf(principalPaise, feeBps);
  const gstOnFeePaise = bpsOf(processingFeePaise, GST_BPS);
  return {
    ratePaBps,
    emiPaise: schedule[0]!.paymentPaise,
    interestPaise,
    processingFeePaise,
    gstOnFeePaise,
    totalCostPaise: interestPaise + processingFeePaise + gstOnFeePaise,
    schedule,
  };
}

export interface CardVsEmi {
  card: CardCost;
  emi: EmiCost;
  /** card total cost − (EMI interest + fee + GST on fee). Positive = member gains. */
  savingPaise: number;
}

export function cardVsEmi(principalPaise: number, months: number, ratePaBps: number, feeBps?: number): CardVsEmi {
  const card = cardCost(principalPaise, months);
  const emi = emiCost(principalPaise, months, ratePaBps, feeBps);
  return { card, emi, savingPaise: card.totalCostPaise - emi.totalCostPaise };
}

/**
 * Annual percentage rate including fees: the monthly IRR of
 * (principal − fee − GST on fee) received against `months` × EMI paid, × 12.
 */
export function aprBps(principalPaise: number, emiPaise: number, months: number, upfrontCostsPaise: number): number {
  const received = principalPaise - upfrontCostsPaise;
  const pv = (r: number) => (r === 0 ? emiPaise * months : (emiPaise * (1 - (1 + r) ** -months)) / r);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > received) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 10_000);
}
