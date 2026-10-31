'use client';

import { credApi, type CardDetail } from '@cred/types';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, List, ListRow, LoadingScreen, Money, SectionHeader } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { dateTime, dueLabel, longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { CardTile } from '../../_components/CardTile';
import { Screen } from '../../_shell/Screen';

type Txn = CardDetail['transactions'][number];

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi(credApi.member.card, { params: { cardId: id } });
  const home = useApi(credApi.member.home);
  const [convert, setConvert] = useState<{ id: string; text: string; busy: boolean } | null>(null);

  async function toEmi(t: Txn) {
    setConvert({ id: t.id, text: 'Checking your options…', busy: true });
    try {
      const r = await api(credApi.products.convertToEmi, { params: { transactionId: t.id } });
      if (r.offer) window.location.href = `/offers/${r.offer.id}`;
      else setConvert({ id: t.id, text: r.decision.explanation, busy: false });
    } catch (e) {
      setConvert({ id: t.id, text: errorText(e), busy: false });
    }
  }

  const d = detail.data;
  const today = home.data?.simDate;
  return (
    <Screen title="Card" back="/cards">
      {detail.error && !d ? (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      ) : !d || !today ? (
        <LoadingScreen label="Loading card" />
      ) : (
        <>
          <CardTile card={d.card} />
          <dl className="grid grid-cols-3 gap-3 text-caption">
            {[
              ['Outstanding', d.card.outstandingPaise],
              ['Available', d.card.availablePaise],
              ['Limit', d.card.limitPaise],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-md border border-border bg-surface p-3 shadow-e1">
                <dt className="text-muted">{k}</dt>
                <dd className="text-headline">
                  <Money paise={v as number} />
                </dd>
              </div>
            ))}
          </dl>

          {d.statement ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Latest statement" />
              <Card className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-caption text-muted">
                      {longDate(d.statement.periodStart)} – {longDate(d.statement.periodEnd)}
                    </p>
                    <Money paise={d.statement.totalDuePaise} size="title" />
                  </div>
                  {d.card.nextDue!.remainingPaise === 0 ? (
                    <Badge tone="positive">Paid</Badge>
                  ) : d.statement.status === 'partial' ? (
                    <Badge tone="warning">Part paid</Badge>
                  ) : (
                    <Badge tone={dueLabel(today, d.statement.dueDate).tone}>{dueLabel(today, d.statement.dueDate).badge}</Badge>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-y-2 text-callout">
                  <dt className="text-muted">Minimum due</dt>
                  <dd className="text-right"><Money paise={d.statement.minDuePaise} /></dd>
                  <dt className="text-muted">Paid so far</dt>
                  <dd className="text-right"><Money paise={d.statement.paidPaise} /></dd>
                  <dt className="text-muted">Due date</dt>
                  <dd className="text-right">{longDate(d.statement.dueDate)}</dd>
                </dl>
                {d.card.nextDue!.remainingPaise > 0 ? (
                  <ButtonLink href={`/pay/${d.card.id}`} block>
                    Pay <Money paise={d.card.nextDue!.remainingPaise} />
                  </ButtonLink>
                ) : null}
                {d.payments.length ? (
                  <ul className="flex flex-col gap-1 border-t border-border pt-3 text-caption text-muted">
                    {d.payments.map((p) => (
                      <li key={p.id} className="flex justify-between">
                        <span>
                          Paid {p.kind === 'full' ? 'in full' : p.kind === 'minimum' ? 'minimum' : 'part'} · {dateTime(p.paidAt)}
                        </span>
                        <Money paise={p.amountPaise} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionHeader title="Recent transactions" />
            {d.transactions.length === 0 ? (
              <EmptyState icon="list" title="No transactions yet" />
            ) : (
              <List>
                {d.transactions.map((t) => (
                  <div key={t.id}>
                    <ListRow
                      title={t.merchant}
                      subtitle={dateTime(t.postedAt)}
                      trailing={
                        <span className="flex flex-col items-end">
                          <Money paise={t.amountPaise} className="font-semibold" />
                          {t.convertible ? (
                            <button
                              onClick={() => toEmi(t)}
                              disabled={convert?.busy}
                              className="-mr-2 min-h-11 px-2 text-caption font-semibold text-accent transition-calm hover:underline disabled:opacity-40"
                            >
                              Convert to EMI
                            </button>
                          ) : null}
                        </span>
                      }
                    />
                    {convert?.id === t.id ? <p role="status" className="animate-fade px-4 pb-3 text-caption text-muted">{convert.text}</p> : null}
                  </div>
                ))}
              </List>
            )}
          </section>
        </>
      )}
    </Screen>
  );
}
