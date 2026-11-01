import { describe, expect, it } from 'vitest';
import { evaluateBalanceSwitch } from './balance-switch';
import { evaluateBigSpend } from './big-spend';
import { evaluateFloater } from './insurance';
import { repaymentPlanOptions } from './repayment-plan';
import { BANNED_MEMBER_WORDS } from '../member-copy';
import { cardCost } from '../finance';
import { fullPayer, laptop } from '../test/fixtures';

describe('repayment plan', () => {
  it('3, 6 and 12 months at the plan rate with no fee, each costing less than carrying it on the card', () => {
    const o = repaymentPlanOptions(80_000_00);
    expect(o.map((x) => x.months)).toEqual([3, 6, 12]);
    for (const x of o) {
      expect(x.ratePaBps).toBe(1200);
      expect(x.cardInterestPaise).toBe(cardCost(80_000_00, x.months).totalCostPaise);
      expect(x.savingPaise).toBe(x.cardInterestPaise - x.totalInterestPaise);
      expect(x.savingPaise).toBeGreaterThan(0);
    }
    // Longer plans: lower monthly amount, more interest
    expect(o[0]!.monthlyPaise).toBeGreaterThan(o[2]!.monthlyPaise);
    expect(o[0]!.totalInterestPaise).toBeLessThan(o[2]!.totalInterestPaise);
  });

  it('while on a plan, no new credit is offered by any feature, in supportive words', () => {
    const s = fullPayer({ onRepaymentPlan: true });
    const big = evaluateBigSpend(s, laptop, null, { origin: 'member_initiated' });
    const sw = evaluateBalanceSwitch(s, { statementRef: 'x', remainingPaise: 30_000_00, paidPaise: 10_000_00 }, null);
    const fl = evaluateFloater(s, { people: [{ id: 'a', name: 'A', relation: 'parent', age: 60 }], coverPaise: 5_00_000_00, existing: null, structure: 'base_vs_topup' }, null);
    for (const r of [big, sw, fl]) {
      if (r.kind !== 'decision') throw new Error('expected decision');
      expect(r.decision.reasons).toEqual(['on_repayment_plan']);
      expect(r.decision.offer).toBeNull();
      expect(r.decision.explanation).not.toMatch(BANNED_MEMBER_WORDS);
    }
  });
});
