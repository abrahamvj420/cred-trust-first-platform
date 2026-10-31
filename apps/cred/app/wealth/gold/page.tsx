'use client';

import { credApi } from '@cred/types';
import { Button, Field, Notice } from '@cred/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

/** Gold isn't on the Account Aggregator, so the member tells us; we value it at today's price. */
export default function AddGold() {
  const router = useRouter();
  const [grams, setGrams] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState('2024-01-01');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = Number(grams);
  const c = Math.round(Number(cost.replace(/,/g, '')) * 100);
  const ok = g > 0 && c > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.addGold, { body: { grams: g, costPaise: c, acquiredOn: date } });
      router.push('/wealth');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Add gold you own"
      back="/wealth"
      footer={
        <Button block disabled={!ok} loading={busy} onClick={save}>
          Add gold
        </Button>
      }
    >
      <p className="text-callout text-muted">Coins, bars or digital gold. Only you know what you hold, so this stays exactly as you tell us.</p>
      <Field label="How many grams?" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
      <Field label="What you paid in total" prefix="₹" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d,]/g, ''))} hint="Used to work out tax if you ever sell" />
      <Field label="When you bought it" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
