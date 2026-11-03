import type { PayDownOption, PayDownTruth } from '@cred/types';
import { cardCost } from '../finance';
import { DEFAULT_RULES, type RuleValues } from '../rules';

/**
 * Pay-down plan: help for a member carrying a card balance, on their own card.
 * No lender and no new credit: the member pays a fixed amount to their card's
 * bank each month. Interest is still charged at the card's rate, so the numbers
 * come from the same savings maths as everywhere else (cardCost).
 */

/** The card bank's minimum due: 5% of the bill, at least ₹200 (as Mock Bank's statements). */
export const MINIMUM_DUE_BPS = 500;
export const MINIMUM_DUE_FLOOR_PAISE = 200_00;
const MAX_MONTHS = 1_200;
const ceilRupee = (paise: number) => Math.ceil(paise / 100) * 100;

/** Interest (with GST) a balance costs this month at the card's rate. */
export function monthlyCardInterestPaise(balancePaise: number, rules: RuleValues = DEFAULT_RULES): number {
  return Math.round((balancePaise * rules.cardInterestMonthlyBps * (10_000 + rules.gstBps)) / 10_000 / 10_000);
}

/** Paying only the minimum each month, with no new spending: how long until it's clear, and the interest paid on the way. */
export function minimumOnlyPath(balancePaise: number, rules: RuleValues = DEFAULT_RULES): PayDownTruth['minimumOnly'] {
  let balance = balancePaise;
  let interestTotal = 0;
  let months = 0;
  let first = 0;
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round((balance * rules.cardInterestMonthlyBps) / 10_000);
    const gst = Math.round((interest * rules.gstBps) / 10_000);
    balance += interest + gst;
    interestTotal += interest + gst;
    const pay = Math.min(balance, Math.max(ceilRupee((balance * MINIMUM_DUE_BPS) / 10_000), MINIMUM_DUE_FLOOR_PAISE));
    if (months === 0) first = pay;
    balance -= pay;
    months++;
  }
  return { months, totalInterestPaise: interestTotal, firstMinimumPaise: first };
}

/** 3, 6 and 12 months: the monthly amount to pay the card's bank, interest still paid on the way, and the saving against minimum-only. */
export function payDownOptions(balancePaise: number, rules: RuleValues = DEFAULT_RULES): PayDownOption[] {
  const minimum = minimumOnlyPath(balancePaise, rules);
  return ([3, 6, 12] as const).map((months) => {
    const card = cardCost(balancePaise, months, rules.cardInterestMonthlyBps, rules.gstBps);
    return {
      months,
      monthlyPaise: ceilRupee((balancePaise + card.totalCostPaise) / months),
      totalInterestPaise: card.totalCostPaise,
      savingPaise: minimum.totalInterestPaise - card.totalCostPaise,
    };
  });
}

/** The whole picture, in rupees. */
export function payDownTruth(balancePaise: number, rules: RuleValues = DEFAULT_RULES): PayDownTruth {
  return {
    balancePaise,
    monthlyInterestPaise: monthlyCardInterestPaise(balancePaise, rules),
    minimumOnly: minimumOnlyPath(balancePaise, rules),
    plans: payDownOptions(balancePaise, rules),
  };
}
