import type { StressSignal } from '@cred/types';
import { STRESS_LOOKBACK_STATEMENTS, STRESS_PARTIAL_PAYMENTS, STRESS_UTILISATION_BPS } from '../constants';
import type { MemberSnapshot } from '../snapshot';

export function utilisationBps(s: MemberSnapshot): number {
  return s.card.limitPaise > 0 ? Math.round((s.card.outstandingPaise * 10_000) / s.card.limitPaise) : 10_000;
}

/** Financial-stress signals. Any signal means: help, not credit. */
export function stressSignals(s: MemberSnapshot): StressSignal[] {
  const out: StressSignal[] = [];
  const settled = s.statements.filter((x) => x.paymentKind !== null || x.dueDate < s.today).slice(0, STRESS_LOOKBACK_STATEMENTS);

  if (settled.some((x) => x.paymentKind === null && x.dueDate < s.today && x.paidPaise < x.minDuePaise) || settled.some((x) => x.onTime === false)) {
    out.push('missed_payment');
  }
  const minimumOnly = settled.filter((x) => x.paymentKind === 'minimum').length;
  const partial = settled.filter((x) => x.paymentKind === 'custom' && x.paidPaise < x.totalDuePaise).length;
  if (minimumOnly >= STRESS_PARTIAL_PAYMENTS) out.push('minimum_only_payments');
  if (minimumOnly + partial >= STRESS_PARTIAL_PAYMENTS) out.push('partial_payments');
  if (utilisationBps(s) >= STRESS_UTILISATION_BPS) out.push('high_utilisation');
  return out;
}
