/**
 * The single source of truth for every rate and fee used in demo maths.
 * Rates are basis points (1600 = 16.00%). See CLAUDE.md → "Key numbers".
 */
export const CARD_INTEREST_MONTHLY_BPS = 350; // 3.5% per month on revolving balance
export const GST_BPS = 1800; // 18% GST on card interest and on processing fees

export const PARTNER_EMI_RATE_PA_BPS = { min: 1600, max: 1800 } as const; // 16–18% p.a.
export const PROCESSING_FEE_BPS = 100; // 1% of principal

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

// ── Offer engine policy (business rules in CLAUDE.md) ────────────────────────

/** Big-Spend Support signal: at least this much, and at least this share of typical monthly spend. */
export const BIG_SPEND_MIN_PAISE = 25_000_00;
export const BIG_SPEND_SHARE_OF_MONTHLY_SPEND_BPS = 5000; // 50%
export const OFFER_TENURE_MONTHS = 12;

/** One active offer at a time; at most this many proactive offers per (sim) calendar month. */
export const MONTHLY_PROACTIVE_OFFER_CAP = 3;
/** After a "No thanks", the same feature stays quiet this long. The declined offer never returns. */
export const DECLINE_COOLDOWN_DAYS = 30;

/** Stress: utilisation at or above this (including the new purchase)… */
export const STRESS_UTILISATION_BPS = 8500; // 85%
/** …or this many partial/minimum payments in the last N settled bills. */
export const STRESS_PARTIAL_PAYMENTS = 2;
export const STRESS_LOOKBACK_STATEMENTS = 3;

/** Affordability: total EMIs at most this share of verified monthly income. */
export const MAX_EMI_TO_INCOME_BPS = 4000; // 40%

/** Lender cooling-off period shown on the key-fact statement (days). */
export const COOLING_OFF_DAYS = 3;
