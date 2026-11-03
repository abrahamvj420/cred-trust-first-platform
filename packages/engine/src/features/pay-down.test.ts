import { describe, expect, it } from 'vitest';
import { evaluateBalanceSwitch } from './balance-switch';
import { evaluateBigSpend } from './big-spend';
import { evaluateFloater } from './insurance';
import { billOutcome, ladderAfter } from './credit-ladder';
import { minimumOnlyPath, monthlyCardInterestPaise, payDownOptions, payDownTruth } from './pay-down';
import { BANNED_MEMBER_WORDS } from '../member-copy';
import { cardCost } from '../finance';
import { repaymentHelp } from '../pipeline';
import { DEFAULT_RULES } from '../rules';
import { fullPayer, laptop, stressed } from '../test/fixtures';

describe('pay-down plan (on the member’s own card, no lender)', () => {
  it('3, 6 and 12 months: interest from the savings maths, and what each saves against paying only the minimum', () => {
    const o = payDownOptions(80_000_00);
    const minimum = minimumOnlyPath(80_000_00);
    expect(o.map((x) => x.months)).toEqual([3, 6, 12]);
    for (const x of o) {
      expect(x.totalInterestPaise).toBe(cardCost(80_000_00, x.months).totalCostPaise);
      // The monthly amount covers the balance and the interest
      expect(x.monthlyPaise * x.months).toBeGreaterThanOrEqual(80_000_00 + x.totalInterestPaise);
      expect(x.monthlyPaise * x.months).toBeLessThan(80_000_00 + x.totalInterestPaise + x.months * 100);
      expect(x.savingPaise).toBe(minimum.totalInterestPaise - x.totalInterestPaise);
      expect(x.savingPaise).toBeGreaterThan(0);
    }
    expect(o[0]!.monthlyPaise).toBeGreaterThan(o[2]!.monthlyPaise);
    expect(o[0]!.totalInterestPaise).toBeLessThan(o[2]!.totalInterestPaise);
  });

  it('minimum only: 5% (at least ₹200) a month takes years and costs more interest than the balance', () => {
    const m = minimumOnlyPath(2_40_212_00);
    expect(m.firstMinimumPaise).toBe(Math.ceil((2_40_212_00 + monthlyCardInterestPaise(2_40_212_00)) * 0.05 / 100) * 100);
    expect(m.months).toBeGreaterThan(120);
    expect(m.months).toBeLessThan(1_200);
    expect(m.totalInterestPaise).toBeGreaterThan(2_40_212_00);
  });

  it('this month’s interest is 3.5% plus GST, the same figure as the help card', () => {
    const t = payDownTruth(1_00_000_00);
    expect(t.monthlyInterestPaise).toBe(4_130_00);
    expect(repaymentHelp(stressed(), DEFAULT_RULES).monthlyInterestPaise).toBe(monthlyCardInterestPaise(stressed().card.outstandingPaise));
    expect(repaymentHelp(stressed(), DEFAULT_RULES).body).not.toMatch(BANNED_MEMBER_WORDS);
  });

  it('a cycle paid at the plan amount, on time, counts towards the ladder like a bill paid in full', () => {
    const bill = { totalDuePaise: 78_879_00, minDuePaise: 3_944_00, paidPaise: 41_000_00, allOnTime: true };
    expect(billOutcome(bill)).toBe('part_paid');
    expect(billOutcome(bill, 41_000_00)).toBe('on_plan');
    expect(billOutcome({ ...bill, paidPaise: 3_944_00 }, 41_000_00)).toBe('part_paid'); // the minimum is still his choice
    expect(billOutcome({ ...bill, allOnTime: false }, 41_000_00)).toBe('missed');
    expect(ladderAfter({ tier: 'starter', onTimeStreak: 0 }, 'on_plan')).toEqual({ tier: 'starter', onTimeStreak: 1, change: 'none' });
  });

  it('while on a plan, no new credit is offered by any feature, in supportive words', () => {
    const s = fullPayer({ onPayDownPlan: true });
    const big = evaluateBigSpend(s, laptop, null, { origin: 'member_initiated' });
    const sw = evaluateBalanceSwitch(s, { statementRef: 'x', remainingPaise: 30_000_00, paidPaise: 10_000_00 }, null);
    const fl = evaluateFloater(s, { people: [{ id: 'a', name: 'A', relation: 'parent', age: 60 }], coverPaise: 5_00_000_00, existing: null, structure: 'base_vs_topup' }, null);
    for (const r of [big, sw, fl]) {
      if (r.kind !== 'decision') throw new Error('expected decision');
      expect(r.decision.reasons).toEqual(['on_pay_down_plan']);
      expect(r.decision.offer).toBeNull();
      expect(r.decision.explanation).not.toMatch(BANNED_MEMBER_WORDS);
    }
  });

  it('limited membership: every feature says no, even when the member asks, with no prompt for Smart Savings', () => {
    const s = fullPayer({ limitedMembership: true, smartSavings: 'never' });
    const asked = evaluateBigSpend(s, laptop, null, { origin: 'member_initiated' });
    const proactive = evaluateBigSpend(s, laptop, null);
    const sw = evaluateBalanceSwitch(s, { statementRef: 'x', remainingPaise: 30_000_00, paidPaise: 10_000_00 }, null);
    const fl = evaluateFloater(s, { people: [{ id: 'a', name: 'A', relation: 'parent', age: 60 }], coverPaise: 5_00_000_00, existing: null, structure: 'base_vs_topup' }, null);
    for (const r of [asked, proactive, sw, fl]) {
      if (r.kind !== 'decision') throw new Error('expected decision');
      expect(r.decision.reasons).toEqual(['not_eligible']);
      expect(r.decision.offer).toBeNull();
      expect(r.decision.explanation).not.toMatch(BANNED_MEMBER_WORDS);
    }
  });
});
