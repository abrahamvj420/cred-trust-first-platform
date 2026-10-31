import { formatBps, formatInr, type CreditLine } from '@cred/types';
import { Decision, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';

/**
 * Salary-Verified Credit (feature 5). From bank transactions the member shared
 * through Account Aggregator, find a regular monthly salary. Only the result
 * (monthly net, employer, months seen) is kept; the transactions are not.
 */
export interface BankTxnInput {
  date: string; // YYYY-MM-DD
  amountPaise: number;
  kind: 'credit' | 'debit';
  narration: string;
}

export interface SalaryFinding {
  monthlyNetPaise: number;
  employer: string;
  monthsVerified: number;
  /** The month of each salary credit used, newest first. */
  months: string[];
}

const SALARY = /\b(SALARY|SAL|PAYROLL)\b/i;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export function detectSalary(txns: BankTxnInput[], rules: RuleValues = DEFAULT_RULES): SalaryFinding | null {
  const credits = txns.filter((t) => t.kind === 'credit' && t.amountPaise > 0 && SALARY.test(t.narration));
  // One salary per month: the largest salary-labelled credit in that month
  const byMonth = new Map<string, BankTxnInput>();
  for (const t of credits) {
    const month = t.date.slice(0, 7);
    const cur = byMonth.get(month);
    if (!cur || t.amountPaise > cur.amountPaise) byMonth.set(month, t);
  }
  const months = [...byMonth.keys()].sort().reverse();
  if (months.length < rules.salaryMinMonths) return null;
  const recent = months.slice(0, 6).map((m) => byMonth.get(m)!);
  const typical = median(recent.map((t) => t.amountPaise));
  // Regular: the recent credits are within 20% of the typical amount
  const regular = recent.filter((t) => Math.abs(t.amountPaise - typical) <= typical * 0.2);
  if (regular.length < rules.salaryMinMonths) return null;
  const employer = regular[0]!.narration.replace(SALARY, '').replace(/[^\w\s.&-]/g, ' ').replace(/\s+/g, ' ').trim() || 'Your employer';
  return {
    monthlyNetPaise: median(regular.map((t) => t.amountPaise)),
    employer: employer.replace(/\b\w+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).replace(/\bLlp\b/g, 'LLP'),
    monthsVerified: regular.length,
    months: regular.map((t) => t.date.slice(0, 7)),
  };
}

/**
 * Verifying salary changes the credit available; it never starts an offer.
 * Recorded as a decision so the member and admin can see what changed and why.
 */
export function evaluateSalaryVerified(finding: SalaryFinding | null, before: CreditLine, after: CreditLine | null): EngineResult {
  const d = new Decision('salary_verified_credit', 'member_initiated');
  if (!finding || !after) {
    return d.stop(
      'signal',
      'not_eligible',
      'No regular salary credit found in the shared bank data.',
      'We couldn’t find a regular monthly salary in the account you shared, so nothing has changed. You can try again with your salary account.',
    );
  }
  d.pass('signal', `Salary ${formatInr(finding.monthlyNetPaise)} a month from ${finding.employer}, seen in ${finding.monthsVerified} months.`);
  d.pass('permission', 'Member chose to verify salary and approved the Account Aggregator consent.');
  return d.available(
    'offer_cap',
    `Limit ${formatInr(before.limitPaise)} → ${formatInr(after.limitPaise)}; rate ${formatBps(before.ratePaBps)} → ${formatBps(after.ratePaBps)}. No offer started.`,
    `Your salary of ${formatInr(finding.monthlyNetPaise)} a month from ${finding.employer} is verified, so up to ${formatInr(after.limitPaise)} from ${formatBps(after.ratePaBps)} a year is available if you ever need it (was ${formatInr(before.limitPaise)} from ${formatBps(before.ratePaBps)}). This doesn’t start any offer.`,
  );
}
