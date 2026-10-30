'use client';

import { ApiError, ecosystemApi, type EndpointResponse } from '@cred/types';
import { Button, Money, Surface } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ecosystem } from '@/lib/api';

type Challenge = EndpointResponse<typeof ecosystemApi.bank.cardAuth>;

/** Mock Bank 3-D Secure: confirm a card payment with the OTP sent to your phone. */
export default function OtpPage() {
  const { authId } = useParams<{ authId: string }>();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ecosystem(ecosystemApi.bank.cardAuth, { params: { authId } }).then(setChallenge, (e) => setError(e instanceof ApiError ? e.message : 'Could not load payment'));
  }, [authId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await ecosystem(ecosystemApi.bank.submitOtp, { params: { authId }, body: { otp } });
      if (r.returnUrl) window.location.href = r.returnUrl;
      else setError('Payment could not be approved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Mock Bank · Secure payment</p>
      {challenge ? (
        <Surface className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Merchant</dt>
            <dd>{challenge.merchantName}</dd>
            <dt className="text-muted">Amount</dt>
            <dd className="font-semibold"><Money paise={challenge.amountPaise} exact /></dd>
            <dt className="text-muted">Card</dt>
            <dd className="tabular">{challenge.cardMasked}</dd>
          </dl>
          {challenge.status === 'pending' ? (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label htmlFor="otp" className="text-sm">
                Enter the 6-digit OTP sent to {challenge.phoneMasked}
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="h-12 rounded-sm border border-border bg-raised px-3 text-lg tracking-[0.4em] tabular"
                required
              />
              <p className="text-xs text-muted">Demo: your OTP is {challenge.demoOtp} (any 6 digits work).</p>
              <Button disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Confirm payment'}</Button>
            </form>
          ) : (
            <p className="text-sm">This payment is already {challenge.status}.</p>
          )}
        </Surface>
      ) : null}
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </main>
  );
}
