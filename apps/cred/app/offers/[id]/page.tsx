'use client';

import { credApi, type Offer } from '@cred/types';
import { Button, Money, Surface } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';

/** Card vs EMI vs loan, side by side, every number from the engine's savings method. */
export default function OfferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(credApi.products.offer, { params: { offerId: id } }).then((r) => setOffer(r.offer), (e) => setError(errorText(e)));
  }, [id]);

  async function decline() {
    await api(credApi.products.declineOffer, { params: { offerId: id }, body: {} });
    router.push('/');
  }

  if (error) return <p className="p-6 text-negative">{error}</p>;
  if (!offer) return <p className="p-6 text-muted">Loading…</p>;
  const open = offer.status === 'shown';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <a href="/" className="text-sm text-muted">← Home</a>
      <h1 className="text-2xl font-semibold">{offer.headline}</h1>
      <p className="text-muted">{offer.subline}</p>
      {!open ? <p className="text-sm text-warning">This offer is {offer.status.replace('_', ' ')}.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {offer.options.map((o) => (
          <Surface key={o.key} className={`flex flex-col gap-2 ${o.recommended ? 'border-accent' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{o.label}</h2>
              {o.recommended ? <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold text-accent-text">Best value</span> : null}
            </div>
            <p className="text-sm text-muted">Total extra cost</p>
            <Money paise={o.totalCostPaise} className="text-2xl font-semibold" />
            {o.monthlyPaise ? <p className="text-sm"><Money paise={o.monthlyPaise} /> a month</p> : null}
            <ul className="text-xs text-muted">
              {o.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-2">
                  <span>{l.label}</span>
                  <Money paise={l.amountPaise} />
                </li>
              ))}
            </ul>
            {o.note ? <p className="text-xs text-muted">{o.note}</p> : null}
            {o.acceptable && open ? (
              <a href={`/offers/${offer.id}/key-facts?option=${o.key}`} className="mt-auto inline-flex h-12 items-center justify-center rounded-md border border-border bg-raised text-sm font-semibold hover:border-accent">
                Continue with {o.key === 'emi' ? 'EMI' : 'loan'}
              </a>
            ) : null}
          </Surface>
        ))}
      </div>

      <Surface className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Why am I seeing this?</h2>
        <p className="text-sm text-muted">{offer.why}</p>
      </Surface>

      <Surface className="flex items-center justify-between">
        <span className="text-sm">If you’d otherwise carry it, you save</span>
        <Money paise={offer.netBenefitPaise} className="text-xl font-bold text-positive" />
      </Surface>
      {open ? <Button variant="secondary" onClick={decline}>No thanks</Button> : null}
    </main>
  );
}
