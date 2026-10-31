'use client';

import { ApiError, ecosystemApi, type EndpointResponse } from '@cred/types';
import { Button, Field, Money, Notice } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ecosystem } from '@/lib/api';

type Challenge = EndpointResponse<typeof ecosystemApi.upi.challenge>;

/** The UPI switch's own PIN page. The paying app (CRED) never sees the PIN. */
export default function UpiPin() {
  const { ref } = useParams<{ ref: string }>();
  const [c, setC] = useState<Challenge | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ecosystem(ecosystemApi.upi.challenge, { params: { upiTxnRef: ref } }).then(
      (x) => {
        if (x.status !== 'awaiting_pin') window.location.href = x.returnUrl;
        else setC(x);
      },
      (e) => setError(e instanceof ApiError ? e.message : 'Could not load this payment'),
    );
  }, [ref]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await ecosystem(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin } });
      if (r.status === 'awaiting_pin') {
        setError(`${r.failureReason ?? 'Incorrect UPI PIN'}. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`);
        setPin('');
        setBusy(false);
      } else {
        window.location.href = r.returnUrl;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-headline font-bold text-accent">UPI</span>
        <span className="text-caption text-muted">Secure PIN entry</span>
      </header>
      {c ? (
        <>
          <section className="flex flex-col gap-1 rounded-md border border-border bg-surface p-5">
            <p className="text-caption text-muted">Paying</p>
            <p className="text-headline">{c.payeeName}</p>
            <p className="text-caption text-muted">{c.payeeVpa}</p>
            <Money paise={c.amountPaise} size="title" exact className="mt-2" />
            {c.note ? <p className="text-caption text-muted">“{c.note}”</p> : null}
          </section>
          <p className="text-callout">
            From <strong>{c.payerBank}</strong> · {c.payerVpa}
            <span className="block text-caption text-muted">Requested by {c.initiatedVia}</span>
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Enter your 4-digit UPI PIN"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              inputClassName="text-center text-title tracking-[0.6em]"
              hint={`Demo: the PIN is ${c.demoPin}.`}
              autoFocus
            />
            {error ? <Notice>{error}</Notice> : null}
            <Button type="submit" block loading={busy} disabled={pin.length !== 4 || busy}>
              Pay
            </Button>
          </form>
        </>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : (
        <p className="text-muted">Loading…</p>
      )}
    </main>
  );
}
