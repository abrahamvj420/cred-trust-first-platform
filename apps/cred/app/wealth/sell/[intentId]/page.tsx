'use client';

import { credApi, type CostOption } from '@cred/types';
import { Badge, Button, ButtonLink, Card, ErrorState, Icon, LoadingScreen, Money, Notice } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { pct } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Why } from '../../../_components/Cards';
import { Screen } from '../../../_shell/Screen';

function CostCard({ title, option, best }: { title: string; option: CostOption; best: boolean }) {
  return (
    <Card elevation={best ? 2 : 1} className={`flex flex-col gap-3 ${best ? 'border-accent/60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-headline">{title}</h2>
        {best ? <Badge tone="accent">Costs less</Badge> : null}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-muted">What it costs you</span>
        <Money paise={option.totalCostPaise} size="title" />
      </div>
      <ul className="flex flex-col gap-1 border-t border-border pt-3 text-caption text-muted">
        {option.lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3">
            <span>{l.label}</span>
            <Money paise={l.amountPaise} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Sell vs borrow, in rupees. Selling is always one tap; borrowing is offered only when it costs less. */
export default function SellVsBorrowPage() {
  const { intentId } = useParams<{ intentId: string }>();
  const q = useApi(credApi.products.sellIntentDetail, { params: { intentId } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = q.data;

  async function sell() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.confirmSell, { params: { intentId } });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  const open = v?.status === 'open';
  return (
    <Screen
      title="Sell or borrow?"
      back={v ? `/wealth/holdings/${v.holdingId}` : '/wealth'}
      footer={
        open ? (
          v.offerId ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" loading={busy} onClick={sell}>
                Sell anyway
              </Button>
              <ButtonLink href={`/offers/${v.offerId}`}>Borrow instead</ButtonLink>
            </div>
          ) : (
            <Button block loading={busy} onClick={sell}>
              Sell <Money paise={v.amountNeededPaise} />
            </Button>
          )
        ) : null
      }
    >
      {q.error && !v ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !v ? (
        <LoadingScreen label="Comparing" />
      ) : (
        <>
          {v.status === 'sold' ? (
            <Notice tone="positive">
              Sold. <Money paise={v.amountNeededPaise} /> is on its way to your bank account.
            </Notice>
          ) : v.status === 'borrowed' ? (
            <Notice tone="positive">You borrowed against it instead. Your holding stays invested.</Notice>
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="text-callout text-muted">
              You need <Money paise={v.amountNeededPaise} /> for {v.months} months from {v.holdingName}.
            </p>
            {v.netBenefitPaise > 0 && v.offerId ? (
              <div className="flex items-baseline gap-2">
                <Money paise={v.netBenefitPaise} size="title" className="text-positive" />
                <span className="text-callout text-muted">less to borrow than to sell</span>
              </div>
            ) : null}
            <Why text={v.explanation} label="How we worked this out" />
          </div>
          <CostCard title="Sell it" option={v.sell} best={!v.offerId} />
          {v.borrow ? (
            <CostCard title="Borrow against it" option={v.borrow} best={!!v.offerId} />
          ) : (
            <Card className="flex items-start gap-3">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-callout text-muted">
                Borrowing against this is capped at <Money paise={v.maxBorrowPaise} /> ({pct(v.loanToValueBps)} of its value), so it isn’t an option for this amount.
              </p>
            </Card>
          )}
          <p className="text-caption text-muted">Tax figures assume this year’s tax-free equity gains allowance is unused and a 30% slab where gains are taxed at slab. Returns are expected, not guaranteed.</p>
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
