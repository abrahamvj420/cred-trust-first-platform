import { describe, expect, it } from 'vitest';
import { annualFeePaise, averageExpenseRatioBps, goalPlan, portfolioTotals } from './wealth';

describe('wealth management (feature 7)', () => {
  it('fees are disclosed in rupees from the expense ratio', () => {
    expect(annualFeePaise(4_10_000_00, 62)).toBe(2_542_00);
    expect(annualFeePaise(8_00_000_00, null)).toBe(0);
    expect(averageExpenseRatioBps([{ valuePaise: 3_00_000_00, expenseRatioBps: 62 }, { valuePaise: 1_00_000_00, expenseRatioBps: 18 }, { valuePaise: 5_00_000_00, expenseRatioBps: null }])).toBe(51);
  });

  it('totals, gains and allocation', () => {
    const t = portfolioTotals([
      { assetClass: 'equity', valuePaise: 6_00_000_00, costPaise: 4_00_000_00, annualFeePaise: 3_000_00 },
      { assetClass: 'fixed_deposit', valuePaise: 4_00_000_00, costPaise: 4_00_000_00, annualFeePaise: 0 },
    ]);
    expect(t).toMatchObject({ totalValuePaise: 10_00_000_00, gainPaise: 2_00_000_00, annualFeesPaise: 3_000_00 });
    expect(t.allocation).toEqual([
      { assetClass: 'equity', label: 'Equity funds', valuePaise: 6_00_000_00, shareBps: 6000 },
      { assetClass: 'fixed_deposit', label: 'Fixed deposits', valuePaise: 4_00_000_00, shareBps: 4000 },
    ]);
  });

  it('goal plan: monthly amount after what is set aside grows, net of fees', () => {
    const p = goalPlan({ targetPaise: 30_00_000_00, targetDate: '2027-12-31', currentPaise: 10_00_000_00, assumedReturnBps: 900 }, '2026-11-02', 50);
    expect(p.monthsLeft).toBe(13);
    expect(p.projectedPaise).toBeGreaterThan(10_00_000_00);
    // Investing the plan monthly at the net rate reaches the target
    const r = (900 - 50) / 10_000 / 12;
    const fv = p.projectedPaise + p.monthlyPlanPaise * (((1 + r) ** 13 - 1) / r);
    expect(fv).toBeGreaterThanOrEqual(30_00_000_00);
    expect(fv - 30_00_000_00).toBeLessThan(100 * 14);
    expect(p.annualFeesPaise).toBe(15_000_00);
    expect(p.onTrack).toBe(false);
  });

  it('already enough set aside → on track, nothing more needed', () => {
    const p = goalPlan({ targetPaise: 5_00_000_00, targetDate: '2028-01-01', currentPaise: 6_00_000_00, assumedReturnBps: 800 }, '2026-11-02', 0);
    expect(p).toMatchObject({ monthlyPlanPaise: 0, onTrack: true });
  });
});
