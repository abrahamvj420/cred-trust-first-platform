'use client';

import { credApi } from '@cred/types';
import { Button, ButtonLink, Card, Choice, ErrorState, Icon, LoadingScreen, Money, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { PlanProgress, Truth } from '../_components/PayDown';
import { Screen } from '../_shell/Screen';

type Months = '3' | '6' | '12';

/**
 * Pay-down plan: the truth about a carried balance, and a plan to clear it on the
 * member's own card. No lender, no loan. Paying only the minimum stays their choice.
 */
export default function PayDownPlanPage() {
  const q = useApi(credApi.products.payDownPlan);
  const v = q.data;
  const [months, setMonths] = useState<Months | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = v?.truth?.plans.find((p) => String(p.months) === months);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  const plan = v?.plan;
  const path = v?.ladder;
  const footer =
    v?.eligible && !plan ? (
      <Button block loading={busy} disabled={!chosen || !read} onClick={() => run(() => api(credApi.products.startPayDownPlan, { body: { months: Number(months) as 3, acknowledged: true } }))}>
        Start my plan
      </Button>
    ) : plan?.status === 'active' && plan.nextAmountPaise > 0 ? (
      <ButtonLink href={`/pay/${plan.cardId}`} block>
        Pay this month’s amount
      </ButtonLink>
    ) : undefined;

  return (
    <Screen title="Pay-down plan" back="/" footer={footer}>
      {q.error && !v ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !v ? (
        <LoadingScreen label="Working out your numbers" />
      ) : (
        <>
          {plan ? (
            <>
              <PlanProgress plan={plan} />
              <Card className="flex flex-col gap-2 p-0">
                <ul className="divide-y divide-border text-callout">
                  {plan.cycles.map((c) => (
                    <li key={c.dueDate} className="flex min-h-12 items-center justify-between gap-3 px-4">
                      <span>Bill due {shortDate(c.dueDate)}</span>
                      <span className="text-right tabular">
                        <Money paise={c.paidPaise} /> of <Money paise={c.planAmountPaise} />
                        <span className={`block text-caption ${c.state === 'on_track' ? 'text-positive' : 'text-muted'}`}>{c.state === 'on_track' ? 'On track' : c.state === 'open' ? 'This month' : 'Below the plan amount'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <p className="text-callout text-muted">{v.note}</p>
            </>
          ) : (
            <Card elevation={2} className="flex flex-col gap-3">
              <p className="text-overline uppercase text-accent">The truth about your balance</p>
              {v.truth ? <Truth truth={v.truth} /> : null}
              <p className="text-callout text-muted">{v.note}</p>
            </Card>
          )}

          {v.eligible && !plan && v.truth ? (
            <>
              <Choice<Months>
                legend="Clear it over"
                name="months"
                value={months}
                onChange={setMonths}
                options={v.truth.plans.map((p) => ({
                  value: String(p.months) as Months,
                  title: (
                    <>
                      <Money paise={p.monthlyPaise} /> a month for {p.months} months
                    </>
                  ),
                  detail: (
                    <>
                      <Money paise={p.totalInterestPaise} /> interest along the way, <Money paise={p.savingPaise} /> less than paying only the minimum
                    </>
                  ),
                }))}
              />
              {chosen ? (
                <Card className="flex flex-col gap-2">
                  <dl className="flex flex-col gap-1 text-callout">
                    {[
                      ['You pay', 'Your own card’s bank, through bill pay'],
                      ['Each month', <Money key="m" paise={chosen.monthlyPaise} />],
                      ['Interest along the way', <Money key="i" paise={chosen.totalInterestPaise} />],
                      ['Less than minimum only', <Money key="s" paise={chosen.savingPaise} />],
                      ['Loan or fee', 'None'],
                    ].map(([k, val]) => (
                      <div key={String(k)} className="flex justify-between gap-4">
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-right">{val}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ) : null}
              {chosen ? (
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-4 text-callout">
                  <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-current text-accent" />I’ll aim to pay this amount each month. I can pay just the minimum, or stop the plan, any time.
                </label>
              ) : null}
            </>
          ) : null}

          {path && (v.eligible || plan?.status === 'active') ? (
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-headline">
                <Icon name="trend" size={20} className="text-accent" /> Stay on track and you’ll start unlocking member benefits
              </p>
              <p className="text-callout text-muted">
                Each month you pay at least the plan amount on time earns coins ({path.coinsPer100} for every ₹100) and counts towards your credit ladder, like a bill paid in full.
                {path.nextTier && path.paymentsNeeded ? ` ${path.paymentsNeeded} on time in a row reaches ${path.nextTier[0]!.toUpperCase() + path.nextTier.slice(1)}.` : ''}
              </p>
            </Card>
          ) : null}

          {plan?.status === 'active' ? (
            <Button variant="quiet" loading={busy} onClick={() => run(() => api(credApi.products.stopPayDownPlan))}>
              Stop the plan
            </Button>
          ) : null}
          <p className="text-caption text-muted">
            Rather talk it through first?{' '}
            <a href="/help" className="text-accent underline">
              Talk to us
            </a>
            .
          </p>
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
