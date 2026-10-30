'use client';

import { credApi, type HelpPlan, type Offer } from '@cred/types';
import { Button, Money, Surface } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

/** Asked once, at the first moment of value. Two choices of equal weight; nothing pre-ticked. */
export function SmartSavingsCard({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = offer.trigger ? `Your ${offer.trigger.merchant} purchase` : offer.headline;

  async function act(grant: boolean) {
    setBusy(true);
    try {
      if (grant) await api(credApi.member.grantPermission, { body: { scope: 'smart_savings', context, explicit: true } });
      else await api(credApi.products.declineOffer, { params: { offerId: offer.id }, body: { reason: 'Not now (Smart Savings)' } });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Surface className="flex flex-col gap-3 border-accent">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Smart Savings</p>
      <h2 className="text-lg font-semibold">
        We found a way to save you <Money paise={offer.netBenefitPaise} /> on this purchase
      </h2>
      <p className="text-sm text-muted">
        Turn on Smart Savings to let CRED look for savings on your card bills and suggest them, only when you gain in rupees and never more than one at a time.
        You can turn it off in one tap from Permissions.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => act(false)}>Not now</Button>
        <Button disabled={busy} onClick={() => act(true)}>Turn on and show me</Button>
      </div>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </Surface>
  );
}

export function OfferCard({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function decline() {
    setBusy(true);
    await api(credApi.products.declineOffer, { params: { offerId: offer.id }, body: {} });
    onDone();
  }
  return (
    <Surface className="flex flex-col gap-3 border-accent">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">You could save</p>
      <p className="text-3xl font-bold text-positive"><Money paise={offer.netBenefitPaise} /></p>
      <h2 className="font-semibold">{offer.headline}</h2>
      <p className="text-sm text-muted">{offer.subline}</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={busy} onClick={decline}>No thanks</Button>
        <a href={`/offers/${offer.id}`} className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-text">
          Compare options
        </a>
      </div>
    </Surface>
  );
}

export function HelpCard({ help }: { help: HelpPlan }) {
  return (
    <Surface className="flex flex-col gap-2 border-warning">
      <p className="text-xs font-semibold uppercase tracking-wider text-warning">Here to help</p>
      <h2 className="font-semibold">{help.title}</h2>
      <p className="text-sm text-muted">{help.body}</p>
      <p className="text-xs text-muted">Repayment plans and a talk-to-us line arrive in a later milestone.</p>
    </Surface>
  );
}
