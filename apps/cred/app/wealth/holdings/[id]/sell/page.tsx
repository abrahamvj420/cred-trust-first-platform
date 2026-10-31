'use client';

import { credApi, formatInr } from '@cred/types';
import { Button, Choice, ErrorState, Field, LoadingScreen, Notice } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { useApi } from '@/lib/live';
import { Screen } from '../../../../_shell/Screen';

const MONTHS = ['3', '6', '12', '24'] as const;

/** The trigger for Wealth-Backed Liquidity: the member starts selling. */
export default function StartSell() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useApi(credApi.products.holding, { params: { holdingId: id } }, { live: false });
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState<(typeof MONTHS)[number]>('12');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = q.data?.holding;
  const paise = Math.round(Number(amount.replace(/,/g, '')) * 100);
  const free = h ? h.valuePaise : 0;
  const fieldError = amount === '' ? null : !Number.isFinite(paise) || paise < 100 ? 'Enter at least ₹1' : paise > free ? `You can sell up to ${formatInr(free)}` : null;

  async function compare() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.products.sellIntent, { body: { holdingId: id, amountNeededPaise: paise, months: Number(months) } });
      router.push(`/wealth/sell/${r.intentId}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Sell some"
      back={`/wealth/holdings/${id}`}
      footer={
        <Button block loading={busy} disabled={!amount || !!fieldError} onClick={compare}>
          See what it costs
        </Button>
      }
    >
      {q.error && !h ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !h ? (
        <LoadingScreen label="Loading" />
      ) : (
        <>
          <p className="text-callout text-muted">{h.name}</p>
          <Field label="How much do you need?" prefix="₹" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} error={fieldError} hint={`Worth ${formatInr(h.valuePaise)} today`} autoFocus />
          <Choice
            legend="For about how long?"
            name="months"
            value={months}
            onChange={setMonths}
            options={MONTHS.map((m) => ({ value: m, title: `${m} months`, detail: m === '12' ? 'Used to compare returns you’d give up with interest you’d pay' : undefined }))}
          />
          <p className="text-caption text-muted">Selling is always your choice. Next, you’ll see selling and borrowing against it side by side, in rupees.</p>
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
