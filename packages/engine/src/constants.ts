import { DEFAULT_RULES } from './rules';

/**
 * Savings-method numbers, derived from the rule defaults (rules.ts is the
 * single source). Rates are basis points (1600 = 16.00%). See CLAUDE.md.
 */
export const CARD_INTEREST_MONTHLY_BPS = DEFAULT_RULES.cardInterestMonthlyBps; // 3.5% a month
export const GST_BPS = DEFAULT_RULES.gstBps; // 18%
export const PARTNER_EMI_RATE_PA_BPS = { min: DEFAULT_RULES.partnerRateMinBps, max: DEFAULT_RULES.partnerRateMaxBps } as const;
export const PROCESSING_FEE_BPS = DEFAULT_RULES.processingFeeBps; // 1%

/** Demo reference case used across tests and copy. */
export const REFERENCE_CASE = { principalPaise: 1_00_000_00, tenureMonths: 12 } as const;

/**
 * Earned Credit Ladder (feature 3). Tiers unlock with consecutive on-time,
 * full bill payments. Rates stay inside the partner range.
 */
export const LADDER_TIERS = [
  { tier: 'starter', requiredOnTimeMonths: 0, limitPaise: 50_000_00, ratePaBps: 1800 },
  { tier: 'silver', requiredOnTimeMonths: 3, limitPaise: 1_50_000_00, ratePaBps: 1750 },
  { tier: 'gold', requiredOnTimeMonths: 9, limitPaise: 3_00_000_00, ratePaBps: 1650 },
  { tier: 'platinum', requiredOnTimeMonths: 18, limitPaise: 5_00_000_00, ratePaBps: 1600 },
] as const;

export function tierForStreak(onTimeStreak: number) {
  return [...LADDER_TIERS].reverse().find((t) => onTimeStreak >= t.requiredOnTimeMonths)!;
}
