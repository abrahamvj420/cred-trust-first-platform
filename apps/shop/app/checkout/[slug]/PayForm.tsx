'use client';

import { Money } from '@cred/ui';
import { useActionState } from 'react';
import { pay } from '../../actions';

export function PayForm({ slug, pricePaise, cards }: { slug: string; pricePaise: number; cards: { token: string; last4: string; network: string; issuerName: string }[] }) {
  const [state, action, pending] = useActionState(pay, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Pay by card</legend>
        {cards.map((c) => (
          <label key={c.token} className="flex items-center gap-3 rounded-md border border-border p-3">
            <input type="radio" name="cardToken" value={c.token} required />
            <span>
              {c.issuerName} {c.network.toUpperCase()} ···· {c.last4}
            </span>
          </label>
        ))}
        {cards.length === 0 ? <p className="text-sm text-muted">No saved cards for this shopper.</p> : null}
      </fieldset>
      {state.error ? <p className="text-sm text-negative">{state.error}</p> : null}
      <button disabled={pending || cards.length === 0} className="h-12 rounded-md bg-accent font-semibold text-accent-text disabled:opacity-50">
        {pending ? 'Contacting your bank…' : <>Pay <Money paise={pricePaise} /></>}
      </button>
    </form>
  );
}
