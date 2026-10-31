'use client';

import { credApi, type Goal } from '@cred/types';
import { Button, Card, ErrorState, Field, LoadingScreen, Money, Notice } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate, rate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

const rupeesIn = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100);
const rupeesOut = (p: number) => String(Math.round(p / 100));

/** A goal: what, how much, by when, and what's set aside. The plan includes fees and is guidance only. */
export default function GoalPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const goals = useApi(credApi.products.goals, undefined, { enabled: !isNew });
  const existing = goals.data?.goals.find((g) => g.id === id) ?? null;
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('2028-12-31');
  const [current, setCurrent] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Goal | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setTarget(rupeesOut(existing.targetPaise));
      setDate(existing.targetDate);
      setCurrent(rupeesOut(existing.currentPaise));
    }
  }, [existing]);

  const ok = name.trim().length > 0 && rupeesIn(target) > 0 && rupeesIn(current) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const shown = saved ?? existing;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), targetPaise: rupeesIn(target), targetDate: date, currentPaise: rupeesIn(current) };
      const r = isNew ? await api(credApi.products.createGoal, { body }) : await api(credApi.products.updateGoal, { params: { goalId: id }, body });
      setSaved(r.goal);
      if (isNew) router.replace(`/wealth/goals/${r.goal.id}`);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await api(credApi.products.deleteGoal, { params: { goalId: id } });
      router.push('/wealth');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title={isNew ? 'New goal' : 'Goal'}
      back="/wealth"
      footer={
        <Button block disabled={!ok} loading={busy} onClick={save}>
          {isNew ? 'Plan this goal' : 'Save changes'}
        </Button>
      }
    >
      {!isNew && goals.error && !goals.data ? (
        <ErrorState message={goals.error} onRetry={goals.reload} />
      ) : !isNew && !goals.data ? (
        <LoadingScreen label="Loading goal" />
      ) : (
        <>
          {shown ? (
            <Card elevation={2} className="flex flex-col gap-3">
              <p className="text-overline uppercase text-accent">Your plan</p>
              {shown.onTrack ? (
                <p className="text-headline">What you’ve set aside should reach {shown.name.toLowerCase()} by {longDate(shown.targetDate)}.</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <Money paise={shown.monthlyPlanPaise} size="title" />
                    <span className="text-callout text-muted">a month for {shown.monthsLeft} months</span>
                  </div>
                  <p className="text-callout text-muted">
                    Your <Money paise={shown.currentPaise} /> could grow to <Money paise={shown.projectedPaise} />; investing this each month covers the rest.
                  </p>
                </>
              )}
              <p className="text-caption text-muted">
                Assumes {rate(shown.assumedReturnBps)} a year before fees of {rate(shown.feeRateBps)} (your funds’ average). At the target that’s about <Money paise={shown.annualFeesPaise} /> a year in fees. Returns
                aren’t guaranteed.
              </p>
            </Card>
          ) : null}
          <Field label="What are you saving for?" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
          <Field label="How much you’ll need" prefix="₹" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d,]/g, ''))} />
          <Field label="By when" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Already set aside for it" prefix="₹" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value.replace(/[^\d,]/g, ''))} hint="Your own figure; we don’t move money" />
          {error ? <Notice>{error}</Notice> : null}
          {!isNew ? (
            <Button variant="quiet" loading={busy} onClick={remove}>
              Delete goal
            </Button>
          ) : null}
        </>
      )}
    </Screen>
  );
}
