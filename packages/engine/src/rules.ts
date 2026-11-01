/**
 * Rule settings: every threshold, cap and rate the engine uses, in one place.
 * The engine takes a `RuleValues` argument (defaulting to these), so M6 can
 * edit them without touching code. Admin reads this list as-is.
 */
export type RuleUnit = 'bps' | 'paise' | 'days' | 'count' | 'months' | 'multiple_bps';

export interface RuleDefinition {
  group:
    | 'Rates'
    | 'Big-Spend signal'
    | 'Likely to carry'
    | 'Stress'
    | 'Affordability'
    | 'Offer control'
    | 'Permissions'
    | 'Key facts'
    | 'Rewards'
    | 'Salary-verified credit'
    | 'Wealth-backed liquidity'
    | 'Card-balance switch'
    | 'Protection'
    | 'Wellness'
    | 'Wealth management';
  label: string;
  unit: RuleUnit;
  value: number;
  /** Allowed range when changed from admin (regulatory or common-sense limits). */
  min: number;
  max: number;
  description: string;
}

export const RULE_DEFINITIONS = {
  // Rates (the savings method)
  cardInterestMonthlyBps: { group: 'Rates', label: 'Card interest per month', unit: 'bps', value: 350, min: 100, max: 500, description: 'Revolving card interest, charged monthly on the reducing balance.' },
  gstBps: { group: 'Rates', label: 'GST on interest and fees', unit: 'bps', value: 1800, min: 0, max: 2800, description: 'GST applied to card interest and to processing fees.' },
  processingFeeBps: { group: 'Rates', label: 'Partner processing fee', unit: 'bps', value: 100, min: 0, max: 500, description: 'One-time fee as a share of the loan amount.' },
  partnerRateMinBps: { group: 'Rates', label: 'Partner EMI rate (lowest)', unit: 'bps', value: 1600, min: 800, max: 3600, description: 'Lowest annual rate partner lenders quote.' },
  partnerRateMaxBps: { group: 'Rates', label: 'Partner EMI rate (highest)', unit: 'bps', value: 1800, min: 800, max: 3600, description: 'Highest annual rate partner lenders quote; used for worst-case affordability.' },
  offerTenureMonths: { group: 'Rates', label: 'Offer tenure', unit: 'months', value: 12, min: 3, max: 36, description: 'Tenure used for EMI and loan comparisons.' },

  // Big-Spend Support signal
  bigSpendMinPaise: { group: 'Big-Spend signal', label: 'Minimum big purchase', unit: 'paise', value: 25_000_00, min: 500000, max: 50000000, description: 'A purchase below this is never treated as a big spend.' },
  bigSpendShareOfMonthlySpendBps: { group: 'Big-Spend signal', label: 'Share of typical monthly bill', unit: 'bps', value: 5000, min: 1000, max: 30000, description: 'A big spend must also be at least this share of the member’s typical monthly bill.' },
  memberEmiMinPaise: { group: 'Big-Spend signal', label: 'Minimum for member-requested EMI', unit: 'paise', value: 5_000_00, min: 100000, max: 10000000, description: 'Smallest purchase a member can convert to EMI themselves.' },

  // Likely to carry
  carryLookbackStatements: { group: 'Likely to carry', label: 'Repayment history used', unit: 'count', value: 6, min: 1, max: 12, description: 'Settled statements used to estimate typical monthly repayment.' },
  carryRepaymentMultipleBps: { group: 'Likely to carry', label: 'Bill vs typical repayment', unit: 'multiple_bps', value: 15000, min: 10000, max: 40000, description: 'Likely to carry when the projected next bill exceeds this multiple of typical monthly repayment (and of repayment plus surplus, if salary is shared).' },

  // Stress
  stressUtilisationBps: { group: 'Stress', label: 'High utilisation', unit: 'bps', value: 8500, min: 5000, max: 10000, description: 'Card utilisation (including the new purchase) at or above this is a stress signal.' },
  stressPartialPayments: { group: 'Stress', label: 'Partial or minimum payments', unit: 'count', value: 2, min: 1, max: 6, description: 'This many partial/minimum payments in the lookback window is a stress signal.' },
  stressLookbackStatements: { group: 'Stress', label: 'Stress lookback', unit: 'count', value: 3, min: 1, max: 12, description: 'Settled statements checked for partial, minimum or missed payments.' },

  // Affordability
  maxEmiToIncomeBps: { group: 'Affordability', label: 'Max EMIs to income', unit: 'bps', value: 4000, min: 1000, max: 6000, description: 'All EMIs together must stay within this share of verified monthly income.' },

  // Offer control
  monthlyProactiveOfferCap: { group: 'Offer control', label: 'Proactive offers per month', unit: 'count', value: 3, min: 0, max: 10, description: 'Most proactive offers a member sees in one (simulated) calendar month. One active offer at a time, always.' },
  declineCooldownDays: { group: 'Offer control', label: 'Quiet period after “No thanks”', unit: 'days', value: 30, min: 0, max: 180, description: 'After a decline, the same feature makes no proactive offers for this long. The declined offer itself never returns.' },

  // Permissions
  permissionReaskDays: { group: 'Permissions', label: 'Re-ask Smart Savings after', unit: 'days', value: 90, min: 7, max: 365, description: 'If a member says “Not now” to Smart Savings, it is not asked again for this long.' },

  // Key facts
  coolingOffDays: { group: 'Key facts', label: 'Cooling-off period', unit: 'days', value: 3, min: 0, max: 30, description: 'Days a member can exit a loan by repaying principal, with no penalty.' },

  // Rewards
  rewardCoinsPer100Rupees: { group: 'Rewards', label: 'Coins per ₹100 paid on time', unit: 'count', value: 10, min: 0, max: 100, description: 'Coins earned for every ₹100 of card bill paid by the due date, in full or in part.' },

  // Salary-verified credit (feature 5)
  salaryMinMonths: { group: 'Salary-verified credit', label: 'Salary months needed', unit: 'count', value: 3, min: 1, max: 12, description: 'Distinct months with a salary credit needed to verify income.' },
  salaryLimitMultipleBps: { group: 'Salary-verified credit', label: 'Limit as a multiple of monthly salary', unit: 'multiple_bps', value: 30000, min: 10000, max: 60000, description: 'With verified salary, the credit limit can rise to this multiple of monthly net salary (never below the ladder tier).' },
  salaryLimitCapPaise: { group: 'Salary-verified credit', label: 'Highest salary-based limit', unit: 'paise', value: 5_00_000_00, min: 5000000, max: 250000000, description: 'Ceiling on the salary-based limit.' },
  salaryRateDiscountBps: { group: 'Salary-verified credit', label: 'Rate discount with verified salary', unit: 'bps', value: 100, min: 0, max: 300, description: 'Partner lenders price verified-salary applicants this much lower.' },

  // Wealth-backed liquidity (feature 2)
  ltvEquityBps: { group: 'Wealth-backed liquidity', label: 'Most you can borrow: equity funds', unit: 'bps', value: 5000, min: 1000, max: 5000, description: 'Loan against equity or hybrid funds is capped at this share of their value.' },
  ltvDebtBps: { group: 'Wealth-backed liquidity', label: 'Most you can borrow: debt funds', unit: 'bps', value: 7500, min: 1000, max: 8000, description: 'Loan against debt funds is capped at this share of their value.' },
  ltvFixedDepositBps: { group: 'Wealth-backed liquidity', label: 'Most you can borrow: fixed deposits', unit: 'bps', value: 8500, min: 1000, max: 9000, description: 'Loan against a fixed deposit is capped at this share of its value.' },
  ltvGoldBps: { group: 'Wealth-backed liquidity', label: 'Most you can borrow: gold', unit: 'bps', value: 6500, min: 1000, max: 7500, description: 'Loan against gold is capped at this share of its value (below the 75% regulatory maximum).' },
  equityLtcgBps: { group: 'Wealth-backed liquidity', label: 'Equity long-term gains tax', unit: 'bps', value: 1250, min: 0, max: 3000, description: 'Tax on gains from equity funds held over 12 months (and gold over 24 months).' },
  equityStcgBps: { group: 'Wealth-backed liquidity', label: 'Equity short-term gains tax', unit: 'bps', value: 2000, min: 0, max: 4000, description: 'Tax on gains from equity funds held 12 months or less.' },
  equityLtcgExemptionPaise: { group: 'Wealth-backed liquidity', label: 'Yearly tax-free equity gains', unit: 'paise', value: 1_25_000_00, min: 0, max: 50000000, description: 'Long-term equity gains up to this amount a year are tax-free (assumed unused).' },
  slabTaxBps: { group: 'Wealth-backed liquidity', label: 'Income tax slab assumed', unit: 'bps', value: 3000, min: 0, max: 4000, description: 'Gains taxed at slab rate (debt funds, short-term gold) use this rate.' },
  fdPrematurePenaltyBps: { group: 'Wealth-backed liquidity', label: 'FD early-withdrawal penalty', unit: 'bps', value: 100, min: 0, max: 300, description: 'Interest-rate cut a bank applies, for the time held, when an FD is broken early.' },

  // Card-balance switch (feature 8)
  switchMinBalancePaise: { group: 'Card-balance switch', label: 'Smallest balance to switch', unit: 'paise', value: 10_000_00, min: 100000, max: 10000000, description: 'A balance carried after a part payment below this is not worth an EMI.' },
  switchTenureMonths: { group: 'Card-balance switch', label: 'Switch tenure', unit: 'months', value: 6, min: 3, max: 24, description: 'Tenure used to compare carrying the balance with switching it to an EMI.' },

  // Protection (features 4, 6)
  healthCoverNeedPaise: { group: 'Protection', label: 'Health cover we suggest', unit: 'paise', value: 10_00_000_00, min: 30000000, max: 1000000000, description: 'Health cover suggested for you, your spouse and children, counting employer cover.' },
  maxPremiumToIncomeBps: { group: 'Protection', label: 'Max premiums to income', unit: 'bps', value: 1000, min: 100, max: 3000, description: 'Suggested premiums must stay within this share of verified yearly income.' },

  // Wellness (feature 4)
  wellnessFullScore: { group: 'Wellness', label: 'Score for the full reward', unit: 'count', value: 80, min: 1, max: 100, description: 'Average weekly activity score that earns the full premium reward.' },
  wellnessHalfScore: { group: 'Wellness', label: 'Score for half the reward', unit: 'count', value: 60, min: 1, max: 100, description: 'Average weekly activity score that earns half the reward.' },
  wellnessQuarterScore: { group: 'Wellness', label: 'Score for a quarter of the reward', unit: 'count', value: 40, min: 1, max: 100, description: 'Average weekly activity score that earns a quarter of the reward.' },

  // Wealth management (feature 7)
  goalAssumedReturnBps: { group: 'Wealth management', label: 'Return assumed for goal plans', unit: 'bps', value: 1000, min: 0, max: 2000, description: 'Yearly return assumed when planning a goal. Guidance only, not a promise.' },
} as const satisfies Record<string, RuleDefinition>;

export type RuleKey = keyof typeof RULE_DEFINITIONS;
export type RuleValues = { [K in RuleKey]: number };

export const DEFAULT_RULES: RuleValues = Object.fromEntries(
  Object.entries(RULE_DEFINITIONS).map(([k, d]) => [k, d.value]),
) as RuleValues;

/** Human-readable value for admin, e.g. 350 bps → "3.5%", 25,00,000 paise → "₹25,000". */
export function formatRuleValue(unit: RuleUnit, value: number): string {
  switch (unit) {
    case 'bps':
      return `${Number((value / 100).toFixed(2))}%`;
    case 'multiple_bps':
      return `${Number((value / 10_000).toFixed(2))}×`;
    case 'paise':
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value / 100);
    case 'days':
      return `${value} days`;
    case 'months':
      return `${value} months`;
    case 'count':
      return String(value);
  }
}

/** Coins for a bill payment: only on-time payments earn. */
export function coinsForBillPayment(amountPaise: number, onTime: boolean, rules: RuleValues = DEFAULT_RULES): number {
  return onTime ? Math.floor(amountPaise / 100 / 100) * rules.rewardCoinsPer100Rupees : 0;
}

/** Checks a proposed change against the rule's range and the rules it depends on. Returns why not, or null. */
export function validateRuleChange(current: RuleValues, key: string, value: number): string | null {
  if (!(key in RULE_DEFINITIONS)) return `Unknown rule ${key}`;
  const def = RULE_DEFINITIONS[key as RuleKey];
  if (!Number.isInteger(value)) return 'Use a whole number';
  if (value < def.min || value > def.max) return `${def.label} must be between ${formatRuleValue(def.unit, def.min)} and ${formatRuleValue(def.unit, def.max)}`;
  const next = { ...current, [key]: value } as RuleValues;
  if (next.partnerRateMinBps > next.partnerRateMaxBps) return 'The lowest partner rate can’t be above the highest';
  if (!(next.wellnessQuarterScore <= next.wellnessHalfScore && next.wellnessHalfScore <= next.wellnessFullScore)) return 'Wellness scores must rise: quarter ≤ half ≤ full';
  if (next.ltvEquityBps > next.ltvDebtBps) return 'Equity funds can’t lend more against them than debt funds';
  return null;
}
