import type { StressSignal } from '@cred/types';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { MemberSnapshot } from '../snapshot';

export function utilisationBps(s: MemberSnapshot): number {
  return s.card.limitPaise > 0 ? Math.round((s.card.outstandingPaise * 10_000) / s.card.limitPaise) : 10_000;
}

/** Financial-stress signals. Any signal means: help, not credit. */
export function stressSignals(s: MemberSnapshot, rules: RuleValues = DEFAULT_RULES): StressSignal[] {
  const out: StressSignal[] = [];
  const settled = s.statements.filter((x) => x.paymentKind !== null || x.dueDate < s.today).slice(0, rules.stressLookbackStatements);

  if (settled.some((x) => x.paymentKind === null && x.dueDate < s.today && x.paidPaise < x.minDuePaise) || settled.some((x) => x.onTime === false)) {
    out.push('missed_payment');
  }
  const minimumOnly = settled.filter((x) => x.paymentKind === 'minimum').length;
  const partial = settled.filter((x) => x.paymentKind === 'custom' && x.paidPaise < x.totalDuePaise).length;
  if (minimumOnly >= rules.stressPartialPayments) out.push('minimum_only_payments');
  if (minimumOnly + partial >= rules.stressPartialPayments) out.push('partial_payments');
  if (utilisationBps(s) >= rules.stressUtilisationBps) out.push('high_utilisation');
  return out;
}
