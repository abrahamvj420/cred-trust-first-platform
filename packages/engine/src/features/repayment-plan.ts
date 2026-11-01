import type { RepaymentPlanOption } from '@cred/types';
import { cardCost, emiCost } from '../finance';
import { DEFAULT_RULES, type RuleValues } from '../rules';

/**
 * Repayment plan: help for a member carrying a card balance, never new credit
 * on top. For each length, the monthly amount and total interest at the plan
 * rate (no fee), next to card interest on the same balance over the same months.
 */
export function repaymentPlanOptions(balancePaise: number, rules: RuleValues = DEFAULT_RULES): RepaymentPlanOption[] {
  return ([3, 6, 12] as const).map((months) => {
    const plan = emiCost(balancePaise, months, rules.planRatePaBps, 0, rules.gstBps);
    const card = cardCost(balancePaise, months, rules.cardInterestMonthlyBps, rules.gstBps);
    return {
      months,
      monthlyPaise: plan.emiPaise,
      totalInterestPaise: plan.interestPaise,
      ratePaBps: rules.planRatePaBps,
      cardInterestPaise: card.totalCostPaise,
      savingPaise: card.totalCostPaise - plan.interestPaise,
    };
  });
}
