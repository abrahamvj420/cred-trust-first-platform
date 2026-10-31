'use client';

import { credApi } from '@cred/types';
import { Avatar, Button, Field, Notice } from '@cred/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

const UPI_MAX_RUPEES = 1_00_000;

function PayAmount() {
  const q = useSearchParams();
  const vpa = q.get('vpa') ?? '';
  const name = q.get('name') ?? vpa;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rupees = Number(amount.replace(/,/g, ''));
  const amountError = amount === '' ? null : !Number.isFinite(rupees) || rupees < 1 ? 'Enter at least ₹1' : rupees > UPI_MAX_RUPEES ? 'UPI payments are limited to ₹1,00,000' : null;
  const ok = amount !== '' && !amountError;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.member.upiPay, { body: { payeeVpa: vpa, amountPaise: Math.round(rupees * 100), note: note.trim() || undefined } });
      window.location.href = r.pinUrl; // the UPI switch's own PIN page
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Pay"
      back="/upi"
      footer={
        <Button block onClick={pay} loading={busy} disabled={!ok || busy}>
          {ok ? `Pay ₹${rupees.toLocaleString('en-IN')}` : 'Enter an amount'}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <Avatar name={name} size={64} />
        <p className="text-headline">{name}</p>
        <p className="text-caption text-muted">{vpa}</p>
      </div>
      <Field
        label="Amount"
        prefix="₹"
        inputMode="decimal"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
        error={amountError}
        inputClassName="text-title tabular"
        autoFocus
      />
      <Field label="Note (optional)" maxLength={50} placeholder="What’s it for?" value={note} onChange={(e) => setNote(e.target.value)} />
      <Notice tone="info">You’ll confirm with your UPI PIN on the next screen. CRED never sees your PIN.</Notice>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PayAmount />
    </Suspense>
  );
}
