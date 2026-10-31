'use client';

import { credApi } from '@cred/types';
import { Badge, Button, ButtonLink, Card, ErrorState, LoadingScreen, Money, Notice } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/live';
import { Why } from '../../_components/Cards';
import { Screen } from '../../_shell/Screen';

/** Pay in full vs card vs EMI vs loan, side by side; every number from the engine's savings method. */
export default function OfferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useApi(credApi.products.offer, { params: { offerId: id } });
  const [busy, setBusy] = useState(false);
  const offer = q.data?.offer;
  const open = offer?.status === 'shown';

  async function decline() {
    setBusy(true);
    await api(credApi.products.declineOffer, { params: { offerId: id }, body: {} }).catch(() => undefined);
    router.push('/');
  }

  return (
    <Screen title="Your options" back="/" footer={open ? <Button block variant="secondary" loading={busy} onClick={decline}>No thanks</Button> : null}>
      {q.error && !offer ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !offer ? (
        <LoadingScreen label="Loading options" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="text-title">{offer.headline}</h2>
            <p className="text-callout text-muted">{offer.subline}</p>
            <Why text={offer.why} />
          </div>
          {!open ? <Notice tone="info">This suggestion is {offer.status.replace('_', ' ')}.</Notice> : null}

          <div className="flex flex-col gap-3">
            {offer.options.map((o) => (
              <Card key={o.key} elevation={o.recommended ? 2 : 1} className={`flex flex-col gap-3 ${o.recommended ? 'border-accent/60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-headline">{o.label}</h3>
                  {o.recommended ? <Badge tone="accent">Lowest cost</Badge> : o.key === 'pay_in_full' ? <Badge tone="positive">Cheapest</Badge> : null}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-caption text-muted">{o.key === 'sell' ? 'What it costs you' : o.terms?.kind === 'insurance' || (o.key === 'no_change' && offer.terms.kind === 'insurance') ? 'Extra you’d pay a year' : 'Extra you pay'}</span>
                  <Money paise={o.totalCostPaise} size="title" />
                </div>
                {o.monthlyPaise ? (
                  <p className="text-caption text-muted">
                    <Money paise={o.monthlyPaise} /> a month
                  </p>
                ) : null}
                {o.lines.length ? (
                  <ul className="flex flex-col gap-1 border-t border-border pt-3 text-caption text-muted">
                    {o.lines.map((l) => (
                      <li key={l.label} className="flex justify-between gap-3">
                        <span>{l.label}</span>
                        <Money paise={l.amountPaise} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {o.note ? <p className="text-caption text-muted">{o.note}</p> : null}
                {o.acceptable && open ? (
                  <ButtonLink href={`/offers/${offer.id}/key-facts?option=${o.key}`} variant={o.recommended ? 'primary' : 'secondary'} block>
                    Continue with {o.key === 'emi' ? 'EMI' : o.key === 'loan' ? 'loan' : 'this cover'}
                  </ButtonLink>
                ) : null}
              </Card>
            ))}
          </div>
          <Card className="flex items-center justify-between">
            <span className="text-callout">You save, {offer.benefitLabel}</span>
            <Money paise={offer.netBenefitPaise} size="headline" className="text-positive" />
          </Card>
        </>
      )}
    </Screen>
  );
}
