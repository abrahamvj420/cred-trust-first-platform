'use client';

import { credApi } from '@cred/types';
import { Badge, Button, Card, Choice, ErrorState, Icon, List, LoadingScreen, Money, Notice, SectionHeader } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate, shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

type Provider = 'apple_health' | 'health_connect';
const PROVIDER: Record<Provider, string> = { apple_health: 'Apple Health', health_connect: 'Google Health Connect' };

/** Wellness Rewards: a weekly activity summary (never raw data) earns a reward on the floater premium. */
export default function Wellness() {
  const q = useApi(credApi.products.wellness);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const w = q.data;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.member.grantPermission, { body: { scope: 'health_data', context: `Wellness rewards via ${PROVIDER[provider!]}`, explicit: true } });
      await api(credApi.products.linkWearable, { body: { provider: provider! } });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  async function stop() {
    setBusy(true);
    try {
      await api(credApi.member.withdrawPermission, { params: { scope: 'health_data' } });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Screen
      title="Wellness rewards"
      back="/protect"
      footer={
        w && !w.linked ? (
          <Button block disabled={!provider} loading={busy} onClick={connect}>
            Share weekly summaries
          </Button>
        ) : null
      }
    >
      {q.error && !w ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !w ? (
        <LoadingScreen label="Loading wellness" />
      ) : w.linked ? (
        <>
          <Card elevation={2} className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-overline uppercase text-accent">
              <Icon name="heart" size={16} /> {w.provider ? PROVIDER[w.provider] : 'Health app'}
            </p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-caption text-muted">Activity score, last 4 weeks</p>
                <p className="text-display tabular">{w.averageScore ?? '–'}</p>
              </div>
              {w.rewardEarnedPaise > 0 ? <Badge tone="positive">{w.rewardPct}% reward</Badge> : null}
            </div>
            {w.policyName ? (
              <p className="text-callout">
                {w.rewardEarnedPaise > 0 ? (
                  <>
                    <Money paise={w.rewardEarnedPaise} className="font-semibold" /> off your {w.policyName} at renewal
                    {w.renewalDate ? ` on ${longDate(w.renewalDate)}` : ''}. Up to <Money paise={w.rewardMaxPaise} /> with a score of 80 or more.
                  </>
                ) : (
                  <>
                    A score of 40 or more earns a reward on your {w.policyName}, up to <Money paise={w.rewardMaxPaise} />.
                  </>
                )}
              </p>
            ) : (
              <p className="text-callout text-muted">Rewards apply to a family floater bought through CRED.</p>
            )}
          </Card>
          <SectionHeader title="Weekly summaries" />
          <List>
            {w.weeks.map((x) => (
              <div key={x.weekStart} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block text-body">Week of {shortDate(x.weekStart)}</span>
                  <span className="block text-caption text-muted">
                    {x.avgDailySteps.toLocaleString('en-IN')} steps a day · {x.activeDays} active days
                  </span>
                </span>
                <span className="text-headline tabular">{x.score}</span>
              </div>
            ))}
          </List>
          <Card className="flex flex-col gap-2">
            <p className="text-callout font-semibold">CRED receives only</p>
            {w.shared.map((s) => (
              <p key={s} className="flex gap-2 text-callout text-muted">
                <Icon name="check" size={18} className="shrink-0 text-positive" /> {s}
              </p>
            ))}
            <p className="mt-2 text-callout font-semibold">Never</p>
            {w.neverShared.map((s) => (
              <p key={s} className="flex gap-2 text-callout text-muted">
                <Icon name="close" size={18} className="shrink-0" /> {s}
              </p>
            ))}
          </Card>
          <Button variant="secondary" loading={busy} onClick={stop}>
            Stop sharing and delete summaries
          </Button>
          {error ? <Notice>{error}</Notice> : null}
        </>
      ) : (
        <>
          <p className="text-callout text-muted">Share a weekly activity summary from your health app and earn up to 10% off your family floater premium at renewal.</p>
          <Card className="flex flex-col gap-2">
            <p className="text-callout font-semibold">What CRED would receive</p>
            {w.shared.map((s) => (
              <p key={s} className="flex gap-2 text-callout text-muted">
                <Icon name="check" size={18} className="shrink-0 text-positive" /> {s}
              </p>
            ))}
            <p className="mt-2 text-callout font-semibold">What it never receives</p>
            {w.neverShared.map((s) => (
              <p key={s} className="flex gap-2 text-callout text-muted">
                <Icon name="close" size={18} className="shrink-0" /> {s}
              </p>
            ))}
          </Card>
          <Choice legend="Your health app" name="provider" value={provider} onChange={setProvider} options={(Object.keys(PROVIDER) as Provider[]).map((p) => ({ value: p, title: PROVIDER[p] }))} />
          <p className="text-caption text-muted">Turn it off any time; we delete the summaries straight away.</p>
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
