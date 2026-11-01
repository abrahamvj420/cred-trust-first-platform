'use client';

import { credApi, type HelpPlan, type Offer } from '@cred/types';
import { Button, ButtonLink, Card, Icon, Money, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

/** "Why am I seeing this?" — every offer carries its plain-English reason. */
export function Why({ text, label = 'Why am I seeing this?' }: { text: string; label?: string }) {
  return (
    <details className="group text-callout">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-muted transition-calm hover:text-text">
        <Icon name="info" size={18} />
        {label}
        <Icon name="chevron" size={16} className="transition-calm group-open:rotate-90" />
      </summary>
      <p className="animate-fade pb-1 text-muted">{text}</p>
    </details>
  );
}

/** Asked once, at the first moment of value. Two choices of equal weight; nothing pre-ticked. */
export function SmartSavingsCard({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const [busy, setBusy] = useState<'on' | 'off' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(grant: boolean) {
    setBusy(grant ? 'on' : 'off');
    try {
      if (grant) await api(credApi.member.grantPermission, { body: { scope: 'smart_savings', context: offer.headline, explicit: true } });
      else await api(credApi.products.declineOffer, { params: { offerId: offer.id }, body: { reason: 'Not now (Smart Savings)' } });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  return (
    <Card elevation={2} className="flex animate-enter flex-col gap-4 border-accent/40">
      <p className="flex items-center gap-2 text-overline uppercase text-accent">
        <Icon name="spark" size={16} /> Smart Savings
      </p>
      <h2 className="text-headline">{offer.headline}</h2>
      <p className="text-callout text-muted">
        Turn on Smart Savings to let CRED look for savings on your card bills and suggest them, only when you gain in rupees and never more than one at a time. You can turn it
        off in one tap from Profile.
      </p>
      <Why text={offer.why} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" loading={busy === 'off'} disabled={!!busy} onClick={() => act(false)}>
          Not now
        </Button>
        <Button loading={busy === 'on'} disabled={!!busy} onClick={() => act(true)}>
          Turn on
        </Button>
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}

export function OfferCard({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const label = offer.origin === 'proactive' ? 'Smart Savings' : 'You asked us to compare';
  const [busy, setBusy] = useState(false);
  async function decline() {
    setBusy(true);
    await api(credApi.products.declineOffer, { params: { offerId: offer.id }, body: {} }).catch(() => undefined);
    onDone();
  }
  return (
    <Card elevation={2} className="flex animate-enter flex-col gap-4 border-accent/40">
      <p className="flex items-center gap-2 text-overline uppercase text-accent">
        <Icon name="spark" size={16} /> {label}
      </p>
      <div className="flex items-baseline gap-2">
        <Money paise={offer.netBenefitPaise} size="title" className="text-positive" />
        <span className="text-callout text-muted">{offer.benefitLabel}</span>
      </div>
      <h2 className="text-headline">{offer.headline}</h2>
      <p className="text-callout text-muted">{offer.subline}</p>
      <Why text={offer.why} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" loading={busy} onClick={decline}>
          No thanks
        </Button>
        <ButtonLink href={`/offers/${offer.id}`}>Compare</ButtonLink>
      </div>
    </Card>
  );
}

export function HelpCard({ help }: { help: HelpPlan }) {
  return (
    <Card elevation={2} className="flex animate-enter flex-col gap-3 border-warning/40">
      <p className="flex items-center gap-2 text-overline uppercase text-warning">
        <Icon name="shield" size={16} /> Here to help
      </p>
      <h2 className="text-headline">{help.title}</h2>
      <p className="text-callout text-muted">{help.body}</p>
      <div className="grid grid-cols-2 gap-3">
        <ButtonLink href="/help" variant="secondary">
          Talk to us
        </ButtonLink>
        <ButtonLink href="/repayment-plan">See a plan</ButtonLink>
      </div>
    </Card>
  );
}
