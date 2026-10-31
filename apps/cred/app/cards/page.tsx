'use client';

import { credApi } from '@cred/types';
import { Badge, EmptyState, ErrorState, LoadingScreen, Money } from '@cred/ui';
import { dueLabel } from '@/lib/format';
import { useApi } from '@/lib/live';
import { CardTile } from '../_components/CardTile';
import { Screen } from '../_shell/Screen';

export default function CardsPage() {
  const cards = useApi(credApi.member.cards);
  const home = useApi(credApi.member.home);
  const today = home.data?.simDate;
  return (
    <Screen title="Cards" tab="cards">
      {cards.error && !cards.data ? (
        <ErrorState message={cards.error} onRetry={cards.reload} />
      ) : !cards.data || !today ? (
        <LoadingScreen label="Loading cards" />
      ) : cards.data.cards.length === 0 ? (
        <EmptyState icon="card" title="No cards linked" body="Cards you add to CRED show up here with their bills." />
      ) : (
        cards.data.cards.map((c) => {
          const due = c.nextDue;
          const label = due ? dueLabel(today, due.dueDate) : null;
          return (
            <div key={c.id} className="flex flex-col gap-3">
              <CardTile card={c} href={`/cards/${c.id}`} />
              {due ? (
                <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-4 text-caption shadow-e1">
                  <div>
                    <dt className="text-muted">Due</dt>
                    <dd className="text-headline">
                      <Money paise={due.remainingPaise} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Due date</dt>
                    <dd className="text-headline">{label!.date.replace(/^(Was due|Due) /, '')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Status</dt>
                    <dd className="pt-1">
                      {due.remainingPaise === 0 ? <Badge tone="positive">Paid</Badge> : due.status === 'partial' ? <Badge tone="warning">Part paid</Badge> : <Badge tone={label!.tone}>{label!.badge}</Badge>}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          );
        })
      )}
    </Screen>
  );
}
