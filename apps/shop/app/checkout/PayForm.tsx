'use client';

import { Money } from '@cred/ui';
import { useActionState, useState } from 'react';
import { pay } from '../actions';

/** Pay by a saved card (bank OTP) or UPI (PIN on the UPI switch). Nothing is pre-selected. */
export function PayForm({ totalPaise, cards, vpa }: { totalPaise: number; cards: { token: string; last4: string; network: string; issuerName: string }[]; vpa: string }) {
  const [state, action, pending] = useActionState(pay, { error: null });
  const [method, setMethod] = useState<'card' | 'upi' | null>(null);
  const tile = (on: boolean) => `flex cursor-pointer items-center gap-3 rounded-md border p-4 ${on ? 'border-accent bg-raised' : 'border-border bg-surface'}`;
  const upiTooHigh = totalPaise > 1_00_000_00;
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Payment</legend>
        <label className={tile(method === 'card')}>
          <input type="radio" name="method" value="card" checked={method === 'card'} onChange={() => setMethod('card')} />
          <span className="font-medium">Credit or debit card</span>
        </label>
        {method === 'card' ? (
          <div className="ml-8 flex flex-col gap-2">
            {cards.map((c) => (
              <label key={c.token} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                <input type="radio" name="cardToken" value={c.token} required />
                {c.issuerName} {c.network.toUpperCase()} ···· {c.last4} <span className="text-muted">(saved)</span>
              </label>
            ))}
            {cards.length === 0 ? <p className="text-sm text-muted">No saved cards for this shopper.</p> : null}
          </div>
        ) : null}
        <label className={`${tile(method === 'upi')} ${upiTooHigh ? 'opacity-50' : ''}`}>
          <input type="radio" name="method" value="upi" checked={method === 'upi'} disabled={upiTooHigh} onChange={() => setMethod('upi')} />
          <span>
            <span className="block font-medium">UPI</span>
            {upiTooHigh ? <span className="block text-xs text-muted">UPI is limited to ₹1,00,000 per payment</span> : null}
          </span>
        </label>
        {method === 'upi' ? (
          <label className="ml-8 flex flex-col gap-1 text-sm">
            Your UPI ID
            <input name="vpa" defaultValue={vpa} className="rounded-md border border-border bg-raised px-3 py-2" />
          </label>
        ) : null}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      <button disabled={pending || !method} className="h-12 rounded-md bg-accent font-semibold text-accent-text hover:brightness-105 disabled:opacity-50">
        {pending ? (method === 'upi' ? 'Opening your UPI app…' : 'Contacting your bank…') : <>Pay <Money paise={totalPaise} /></>}
      </button>
      <p className="text-xs text-muted">Card payments are confirmed by your bank with an OTP; UPI with your UPI PIN.</p>
    </form>
  );
}
