'use client';

import type { PayDownPlan, PayDownTruth } from '@cred/types';
import { Badge, Card, Money, ProgressBar } from '@cred/ui';
import { shortDate } from '@/lib/format';

/** "26 years 3 months", "8 months". */
export function duration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
  return [part(y, 'year'), part(m, 'month')].filter(Boolean).join(' ') || '0 months';
}

/** The truth about a carried balance, in rupees: this month's interest, minimum only, and each plan. */
export function Truth({ truth, compact = false }: { truth: PayDownTruth; compact?: boolean }) {
  const rows = [
    { label: 'Paying only the minimum', time: duration(truth.minimumOnly.months), interest: truth.minimumOnly.totalInterestPaise, saving: null as number | null },
    ...truth.plans.map((p) => ({ label: `Plan: ${p.months} months`, time: <><Money paise={p.monthlyPaise} /> a month</>, interest: p.totalInterestPaise, saving: p.savingPaise })),
  ];
  return (
    <div className="flex flex-col gap-3" aria-label="The truth about your balance">
      <p className="text-callout">
        Your balance of <Money paise={truth.balancePaise} className="font-semibold" /> costs about <Money paise={truth.monthlyInterestPaise} className="font-semibold" /> a month in interest (3.5% a month plus GST).
      </p>
      <table className="w-full text-left text-caption">
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-normal">If you pay</th>
            <th className="py-1 font-normal">How long</th>
            <th className="py-1 text-right font-normal">Interest you pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-2 pr-2 font-semibold">{r.label}</td>
              <td className="py-2 pr-2 tabular">{r.time}</td>
              <td className="py-2 text-right tabular">
                <Money paise={r.interest} />
                {r.saving !== null && !compact ? (
                  <span className="block text-positive">
                    <Money paise={r.saving} /> less
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-muted">
        Minimum only means about <Money paise={truth.minimumOnly.firstMinimumPaise} /> this month, falling as the balance falls. All figures assume no new spending on the card.
      </p>
    </div>
  );
}

/** A plan in progress, shown under the card. */
export function PlanProgress({ plan, href }: { plan: PayDownPlan; href?: string }) {
  const body = (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-headline">Pay-down plan</h2>
        <Badge tone={plan.status === 'active' ? 'positive' : 'neutral'}>{plan.status === 'active' ? `${plan.onTrackCycles} of ${plan.months} on track` : plan.status}</Badge>
      </div>
      <ProgressBar value={Math.min(1, plan.paidSoFarPaise / Math.max(1, plan.startBalancePaise))} label="Paid towards your balance" warnAt={2} alertAt={2} />
      <p className="text-caption text-muted">
        <Money paise={plan.paidSoFarPaise} /> paid of <Money paise={plan.startBalancePaise} />, to your own card. No loan.
      </p>
      {plan.status === 'active' && plan.cycles.length === 0 ? (
        <p className="text-callout">Your plan starts with your next bill. Pay what you can on the current one; the minimum is fine.</p>
      ) : null}
      {plan.status === 'active' && plan.nextDueDate ? (
        <p className="text-callout">
          {plan.nextAmountPaise > 0 ? (
            <>
              This month: <Money paise={plan.nextAmountPaise} className="font-semibold" /> by {shortDate(plan.nextDueDate)}
            </>
          ) : (
            <>You’re on track for this month’s bill.</>
          )}
        </p>
      ) : null}
    </Card>
  );
  return href ? (
    <a href={href} className="block rounded-lg transition-calm hover:opacity-95">
      {body}
    </a>
  ) : (
    body
  );
}
