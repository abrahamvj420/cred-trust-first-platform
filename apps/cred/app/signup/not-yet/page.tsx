'use client';

import { credApi } from '@cred/types';
import { Avatar, Badge, ButtonLink, Card, ErrorState, List, ListRow, LoadingScreen, SectionHeader } from '@cred/ui';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

/** Below the membership score: what's open now, how to grow the score, and what's coming. */
export default function NotYet() {
  const q = useApi(credApi.signup.status, undefined, { live: false });
  const s = q.data;
  return (
    <Screen title="Your membership" back="/">
      {q.error && !s ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !s ? (
        <LoadingScreen label="Loading" />
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <p className="text-overline uppercase text-accent">Not yet, but you’re on your way</p>
            <h2 className="text-title">Full membership starts at a credit score of {s.minScore}</h2>
            <p className="text-callout text-muted">
              Your score from {s.bureauName} is <span className="font-semibold text-text tabular">{s.creditScore}</span>. Scores move with your habits, and the tips below help. We won’t suggest any credit for now.
            </p>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Yours to use today" />
            <List>
              <ListRow href="/upi" leading={<Avatar icon="upi" />} title="Pay by UPI" subtitle="Friends, shops, any UPI ID" />
              <ListRow href={s.hasCard ? '/cards' : '/signup/card'} leading={<Avatar icon="card" />} title="Pay your card bills" subtitle={s.hasCard ? 'See and pay your bills' : 'Add your card to get started'} />
            </List>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Ways to grow your score" />
            <Card className="p-0">
              <dl className="flex flex-col divide-y divide-border">
                {s.tips.map((t) => (
                  <div key={t.title} className="flex flex-col gap-1 p-4">
                    <dt className="text-callout font-semibold">{t.title}</dt>
                    <dd className="text-callout text-muted">{t.body}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>

          <Card className="flex flex-col gap-2" data-placeholder="secured-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-headline">Secured card</h2>
              <Badge>Coming soon</Badge>
            </div>
            <p className="text-callout text-muted">A card backed by a deposit you make, to help you build your score. We’ll tell you here when it’s ready.</p>
          </Card>

          <ButtonLink href="/" variant="secondary" block>Go to home</ButtonLink>
        </>
      )}
    </Screen>
  );
}
