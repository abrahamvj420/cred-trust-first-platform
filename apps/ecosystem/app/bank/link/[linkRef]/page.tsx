'use client';

import { ApiError, ecosystemApi, type EndpointResponse } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ecosystem } from '@/lib/api';

type Link = EndpointResponse<typeof ecosystemApi.bank.cardLink>;

/** Mock Bank: a payment app asks to link your card. You approve here, at your bank, not in the app. */
export default function CardLinkPage() {
  const { linkRef } = useParams<{ linkRef: string }>();
  const [link, setLink] = useState<Link | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ecosystem(ecosystemApi.bank.cardLink, { params: { linkRef } }).then(setLink, (e) => setError(e instanceof ApiError ? e.message : 'Could not load this request'));
  }, [linkRef]);

  async function decide(body: { decision: 'approve'; otp: string } | { decision: 'reject' }) {
    setBusy(true);
    setError(null);
    try {
      const r = await ecosystem(ecosystemApi.bank.decideCardLink, { params: { linkRef }, body });
      window.location.href = r.returnUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Mock Bank · Link your card</p>
      {link ? (
        <Surface className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">{link.requester} wants to link your card</h1>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Customer</dt>
            <dd>{link.customerName}</dd>
            <dt className="text-muted">Card</dt>
            <dd className="tabular">{link.cardMasked}</dd>
            <dt className="text-muted">Network</dt>
            <dd className="capitalize">{link.network}</dd>
          </dl>
          <p className="text-sm text-muted">If you approve, {link.bankName} shares your card limit, your recent bills and purchases, and new ones from now on, so you can see and pay them in {link.requester}.</p>
          {link.status === 'pending' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void decide({ decision: 'approve', otp });
              }}
              className="flex flex-col gap-3"
            >
              <label htmlFor="otp" className="text-sm">
                Enter the 6-digit OTP sent to {link.phoneMasked}
              </label>
              <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="h-12 rounded-sm border border-border bg-raised px-3 text-lg tracking-[0.4em] tabular" required />
              <p className="text-xs text-muted">Demo: any 6 digits work.</p>
              <Button disabled={busy || otp.length !== 6}>{busy ? 'Approving…' : 'Approve'}</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => decide({ decision: 'reject' })}>
                Decline
              </Button>
            </form>
          ) : (
            <p className="text-sm">This request has already been answered.</p>
          )}
        </Surface>
      ) : null}
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </main>
  );
}
