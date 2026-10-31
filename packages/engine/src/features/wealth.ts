import type { AssetClass, Holding } from '@cred/types';
import { DEFAULT_RULES, type RuleValues } from '../rules';

/**
 * Wealth Management (feature 7): tracking, goals and fees disclosed. Guidance
 * only: nothing here recommends a product, and CRED earns nothing from it.
 */
const ASSET_LABEL: Record<AssetClass, string> = { equity: 'Equity funds', debt: 'Debt funds', hybrid: 'Hybrid funds', gold: 'Gold', fixed_deposit: 'Fixed deposits' };

/** Fees paid to the fund house in a year at today's value. FDs and gold held directly have none. */
export const annualFeePaise = (valuePaise: number, expenseRatioBps: number | null) => (expenseRatioBps ? Math.round((valuePaise * expenseRatioBps) / 10_000) : 0);

export function portfolioTotals(holdings: Pick<Holding, 'assetClass' | 'valuePaise' | 'costPaise' | 'annualFeePaise'>[]) {
  const totalValuePaise = holdings.reduce((a, h) => a + h.valuePaise, 0);
  const totalCostPaise = holdings.reduce((a, h) => a + h.costPaise, 0);
  const byClass = new Map<AssetClass, number>();
  for (const h of holdings) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.valuePaise);
  return {
    totalValuePaise,
    totalCostPaise,
    gainPaise: totalValuePaise - totalCostPaise,
    annualFeesPaise: holdings.reduce((a, h) => a + h.annualFeePaise, 0),
    allocation: [...byClass.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([assetClass, valuePaise]) => ({ assetClass, label: ASSET_LABEL[assetClass], valuePaise, shareBps: totalValuePaise ? Math.round((valuePaise * 10_000) / totalValuePaise) : 0 })),
  };
}

/** Value-weighted expense ratio of the member's funds (0 when they hold none). */
export function averageExpenseRatioBps(holdings: Pick<Holding, 'valuePaise' | 'expenseRatioBps'>[]): number {
  const funds = holdings.filter((h) => h.expenseRatioBps !== null);
  const value = funds.reduce((a, h) => a + h.valuePaise, 0);
  return value ? Math.round(funds.reduce((a, h) => a + h.valuePaise * h.expenseRatioBps!, 0) / value) : 0;
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
};

export interface GoalPlan {
  monthsLeft: number;
  projectedPaise: number;
  monthlyPlanPaise: number;
  /** Fees a year once the goal is fully funded, at the fee rate. */
  annualFeesPaise: number;
  onTrack: boolean;
}

/**
 * Monthly amount to invest to reach the target by the date, after what's set
 * aside grows at the assumed return (net of fees, so fees aren't hidden in it).
 */
export function goalPlan(g: { targetPaise: number; targetDate: string; currentPaise: number; assumedReturnBps: number }, today: string, feeRateBps: number): GoalPlan {
  const n = monthsBetween(today, g.targetDate);
  const r = Math.max(0, g.assumedReturnBps - feeRateBps) / 10_000 / 12;
  const grow = (1 + r) ** n;
  const projectedPaise = Math.round(g.currentPaise * grow);
  const shortfall = Math.max(0, g.targetPaise - projectedPaise);
  const monthlyPlanPaise = n === 0 ? shortfall : Math.ceil((r === 0 ? shortfall / n : (shortfall * r) / (grow - 1)) / 100) * 100;
  return { monthsLeft: n, projectedPaise, monthlyPlanPaise, annualFeesPaise: Math.round((g.targetPaise * feeRateBps) / 10_000), onTrack: shortfall === 0 };
}

export const defaultGoalReturnBps = (rules: RuleValues = DEFAULT_RULES) => rules.goalAssumedReturnBps;
