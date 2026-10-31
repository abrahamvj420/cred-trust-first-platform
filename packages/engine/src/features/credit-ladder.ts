import { formatBps, formatInr, type CreditLine, type CreditTier } from '@cred/types';
import { stressSignals } from '../checks/stress';
import { LADDER_TIERS, tierForStreak } from '../constants';
import { Decision, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { MemberSnapshot } from '../snapshot';

/**
 * Earned Credit Ladder (feature 3). Tiers unlock with consecutive bills paid
 * in full by the due date. Limits are shown as available, never pushed.
 */
export type BillOutcome = 'paid_in_full' | 'part_paid' | 'missed';

export interface SettledBill {
  totalDuePaise: number;
  minDuePaise: number;
  paidPaise: number;
  /** Every payment on the bill arrived by the due date (true when there were none). */
  allOnTime: boolean;
}

/** What a bill counts as once its due date has passed. */
export function billOutcome(b: SettledBill): BillOutcome {
  if (b.paidPaise >= b.totalDuePaise && b.allOnTime) return 'paid_in_full';
  if (b.paidPaise >= b.minDuePaise && b.allOnTime) return 'part_paid';
  return 'missed';
}

const TIER_ORDER = LADDER_TIERS.map((t) => t.tier) as CreditTier[];
const rank = (t: CreditTier) => TIER_ORDER.indexOf(t);

export interface LadderPosition {
  tier: CreditTier;
  onTimeStreak: number;
}

export interface LadderStep extends LadderPosition {
  change: 'up' | 'down' | 'none';
}

/**
 * One bill's effect on the ladder:
 * - paid in full on time: streak +1, and the tier rises once the streak reaches it;
 * - part paid (at least the minimum, on time): streak back to 0, tier kept;
 * - missed (below the minimum, or late): streak back to 0, down one tier.
 */
export function ladderAfter(prev: LadderPosition, outcome: BillOutcome): LadderStep {
  if (outcome === 'paid_in_full') {
    const onTimeStreak = prev.onTimeStreak + 1;
    const earned = tierForStreak(onTimeStreak).tier as CreditTier;
    const tier = rank(earned) > rank(prev.tier) ? earned : prev.tier;
    return { tier, onTimeStreak, change: tier !== prev.tier ? 'up' : 'none' };
  }
  if (outcome === 'part_paid') return { tier: prev.tier, onTimeStreak: 0, change: 'none' };
  const tier = TIER_ORDER[Math.max(0, rank(prev.tier) - 1)]!;
  return { tier, onTimeStreak: 0, change: tier !== prev.tier ? 'down' : 'none' };
}

/** Next tier and the in-full payments still needed for it. */
export function nextTier(pos: LadderPosition): { tier: CreditTier; paymentsNeeded: number } | null {
  const next = LADDER_TIERS.find((t) => rank(t.tier as CreditTier) > rank(pos.tier));
  return next ? { tier: next.tier as CreditTier, paymentsNeeded: Math.max(1, next.requiredOnTimeMonths - pos.onTimeStreak) } : null;
}

export const tierLabel = (t: CreditTier) => t[0]!.toUpperCase() + t.slice(1);

/**
 * The credit a member could use: the ladder tier's limit and rate, raised by
 * verified salary (feature 5). Hidden while the member is clearing a balance.
 */
export function creditLine(tier: CreditTier, verifiedMonthlyIncomePaise: number | null, stressed: boolean, rules: RuleValues = DEFAULT_RULES): CreditLine {
  const t = LADDER_TIERS.find((x) => x.tier === tier)!;
  let limitPaise: number = t.limitPaise;
  let ratePaBps: number = t.ratePaBps;
  let basis: CreditLine['basis'] = 'ladder';
  if (verifiedMonthlyIncomePaise !== null) {
    const bySalary = Math.min(rules.salaryLimitCapPaise, Math.round((verifiedMonthlyIncomePaise * rules.salaryLimitMultipleBps) / 10_000));
    if (bySalary > limitPaise) limitPaise = bySalary;
    ratePaBps = Math.max(0, ratePaBps - rules.salaryRateDiscountBps);
    basis = 'salary_verified';
  }
  const note = stressed
    ? 'We’ll show what’s available once your card balance is lower. Paying bills in full keeps you moving up.'
    : basis === 'salary_verified'
      ? `Available if you ever need it: up to ${formatInr(limitPaise)}, from ${formatBps(ratePaBps)} a year, with your verified salary. We won’t suggest you borrow.`
      : `Available if you ever need it: up to ${formatInr(limitPaise)}, from ${formatBps(ratePaBps)} a year. We won’t suggest you borrow.`;
  return { limitPaise, ratePaBps, basis, shown: !stressed, note };
}

/**
 * A tier change, through the engine. It is recorded like any decision but is
 * never an offer: an unlock is shown as available, in the app, and nowhere else.
 */
export function evaluateLadderChange(s: MemberSnapshot, prev: LadderPosition, step: LadderStep, rules: RuleValues = DEFAULT_RULES): EngineResult {
  const d = new Decision('earned_credit_ladder', 'proactive');
  const label = tierLabel(step.tier);
  if (step.change === 'none') {
    return d.stop('signal', 'no_signal', `No tier change (streak ${step.onTimeStreak}).`, `Your bill is counted. You’re on ${step.onTimeStreak} in a row at ${label}.`);
  }
  if (step.change === 'down') {
    return d.stop(
      'signal',
      'no_signal',
      `Missed payment: ${tierLabel(prev.tier)} → ${label}, streak reset.`,
      `A bill wasn’t paid by its due date, so you’re at ${label} for now. Paying the next ones in full and on time moves you back up.`,
    );
  }
  d.pass('signal', `${step.onTimeStreak} bills in full, on time: ${tierLabel(prev.tier)} → ${label}.`);
  d.pass('permission', 'Shown in the app as available; never pushed, so no Smart Savings needed.');
  const signals = stressSignals(s, rules);
  if (signals.length) {
    return d.help(
      signals,
      `Tier ${label} earned but limit not shown: ${signals.join(', ')}.`,
      `You’ve reached ${label}. We’ll show what it unlocks once your card balance is lower.`,
      null,
    );
  }
  d.pass('stress', 'No stress signals.');
  const t = LADDER_TIERS.find((x) => x.tier === step.tier)!;
  return d.available(
    'offer_cap',
    `Unlocked ${label}: up to ${formatInr(t.limitPaise)} at ${formatBps(t.ratePaBps)}. Not an offer: no cap used.`,
    `You’ve paid ${step.onTimeStreak} bills in full and on time in a row, so ${label} is unlocked: up to ${formatInr(t.limitPaise)} from ${formatBps(t.ratePaBps)} a year, available whenever you need it. We won’t suggest you borrow.`,
  );
}
