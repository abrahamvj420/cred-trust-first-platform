/**
 * Rule settings: every threshold, cap and rate the engine uses, in one place.
 * The engine takes a `RuleValues` argument (defaulting to these), so M6 can
 * edit them without touching code. Admin reads this list as-is.
 */
export type RuleUnit = 'bps' | 'paise' | 'days' | 'count' | 'months' | 'multiple_bps';

export interface RuleDefinition {
  group: 'Rates' | 'Big-Spend signal' | 'Likely to carry' | 'Stress' | 'Affordability' | 'Offer control' | 'Permissions' | 'Key facts' | 'Rewards';
  label: string;
  unit: RuleUnit;
  value: number;
  description: string;
}

export const RULE_DEFINITIONS = {
  // Rates (the savings method)
  cardInterestMonthlyBps: { group: 'Rates', label: 'Card interest per month', unit: 'bps', value: 350, description: 'Revolving card interest, charged monthly on the reducing balance.' },
  gstBps: { group: 'Rates', label: 'GST on interest and fees', unit: 'bps', value: 1800, description: 'GST applied to card interest and to processing fees.' },
  processingFeeBps: { group: 'Rates', label: 'Partner processing fee', unit: 'bps', value: 100, description: 'One-time fee as a share of the loan amount.' },
  partnerRateMinBps: { group: 'Rates', label: 'Partner EMI rate (lowest)', unit: 'bps', value: 1600, description: 'Lowest annual rate partner lenders quote.' },
  partnerRateMaxBps: { group: 'Rates', label: 'Partner EMI rate (highest)', unit: 'bps', value: 1800, description: 'Highest annual rate partner lenders quote; used for worst-case affordability.' },
  offerTenureMonths: { group: 'Rates', label: 'Offer tenure', unit: 'months', value: 12, description: 'Tenure used for EMI and loan comparisons.' },

  // Big-Spend Support signal
  bigSpendMinPaise: { group: 'Big-Spend signal', label: 'Minimum big purchase', unit: 'paise', value: 25_000_00, description: 'A purchase below this is never treated as a big spend.' },
  bigSpendShareOfMonthlySpendBps: { group: 'Big-Spend signal', label: 'Share of typical monthly bill', unit: 'bps', value: 5000, description: 'A big spend must also be at least this share of the member’s typical monthly bill.' },
  memberEmiMinPaise: { group: 'Big-Spend signal', label: 'Minimum for member-requested EMI', unit: 'paise', value: 5_000_00, description: 'Smallest purchase a member can convert to EMI themselves.' },

  // Likely to carry
  carryLookbackStatements: { group: 'Likely to carry', label: 'Repayment history used', unit: 'count', value: 6, description: 'Settled statements used to estimate typical monthly repayment.' },
  carryRepaymentMultipleBps: { group: 'Likely to carry', label: 'Bill vs typical repayment', unit: 'multiple_bps', value: 15000, description: 'Likely to carry when the projected next bill exceeds this multiple of typical monthly repayment (and of repayment plus surplus, if salary is shared).' },

  // Stress
  stressUtilisationBps: { group: 'Stress', label: 'High utilisation', unit: 'bps', value: 8500, description: 'Card utilisation (including the new purchase) at or above this is a stress signal.' },
  stressPartialPayments: { group: 'Stress', label: 'Partial or minimum payments', unit: 'count', value: 2, description: 'This many partial/minimum payments in the lookback window is a stress signal.' },
  stressLookbackStatements: { group: 'Stress', label: 'Stress lookback', unit: 'count', value: 3, description: 'Settled statements checked for partial, minimum or missed payments.' },

  // Affordability
  maxEmiToIncomeBps: { group: 'Affordability', label: 'Max EMIs to income', unit: 'bps', value: 4000, description: 'All EMIs together must stay within this share of verified monthly income.' },

  // Offer control
  monthlyProactiveOfferCap: { group: 'Offer control', label: 'Proactive offers per month', unit: 'count', value: 3, description: 'Most proactive offers a member sees in one (simulated) calendar month. One active offer at a time, always.' },
  declineCooldownDays: { group: 'Offer control', label: 'Quiet period after “No thanks”', unit: 'days', value: 30, description: 'After a decline, the same feature makes no proactive offers for this long. The declined offer itself never returns.' },

  // Permissions
  permissionReaskDays: { group: 'Permissions', label: 'Re-ask Smart Savings after', unit: 'days', value: 90, description: 'If a member says “Not now” to Smart Savings, it is not asked again for this long.' },

  // Key facts
  coolingOffDays: { group: 'Key facts', label: 'Cooling-off period', unit: 'days', value: 3, description: 'Days a member can exit a loan by repaying principal, with no penalty.' },

  // Rewards
  rewardCoinsPer100Rupees: { group: 'Rewards', label: 'Coins per ₹100 paid on time', unit: 'count', value: 10, description: 'Coins earned for every ₹100 of card bill paid by the due date, in full or in part.' },
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
