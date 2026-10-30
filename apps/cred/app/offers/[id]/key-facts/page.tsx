'use client';

import { credApi, type KeyFactStatement } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorText, useMemberStream, useToken } from '@/lib/api';

type Step = 'review' | 'otp' | 'waiting';

function KeyFacts() {
  const { id } = useParams<{ id: string }>();
  const option = useSearchParams().get('option') === 'loan' ? 'loan' : 'emi';
  const router = useRouter();
  const token = useToken();
  const [kfs, setKfs] = useState<KeyFactStatement | null>(null);
  const [read, setRead] = useState(false); // never pre-ticked
  const [step, setStep] = useState<Step>('review');
  const [otpInfo, setOtpInfo] = useState<{ sentTo: string; demoOtp: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(credApi.products.keyFacts, { params: { offerId: id }, query: { option } }).then(setKfs, (e) => setError(errorText(e)));
  }, [id, option]);

  // When the lender's disbursal webhook lands, cred-api pushes loan.updated.
  const goToLoan = async () => {
    const loan = (await api(credApi.products.loans)).loans.find((l) => l.offerId === id);
    if (loan?.status === 'disbursed') router.push(`/loans/${loan.id}`);
  };
  useMemberStream(token, (e) => {
    if (e.type === 'loan.updated' && step === 'waiting') void goToLoan();
  });

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.products.acceptOffer, { params: { offerId: id }, body: { option, keyFactsAcknowledged: true } });
      setOtpInfo(r.otp);
      setStep('otp');
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.confirmOffer, { params: { offerId: id }, body: { otp } });
      setStep('waiting');
      setTimeout(goToLoan, 800); // in case the webhook beat us here
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (error && !kfs) return <p className="p-6 text-negative">{error}</p>;
  if (!kfs) return <p className="p-6 text-muted">Loading key facts…</p>;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <a href={`/offers/${id}`} className="text-sm text-muted">← Back to options</a>
      <h1 className="text-2xl font-semibold">Key facts</h1>
      <Surface>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          {kfs.items.map((i) => (
            <div key={i.label} className="contents">
              <dt className="text-muted">{i.label}</dt>
              <dd className="text-right tabular">{i.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Grievances: {kfs.grievanceContact}</p>
      </Surface>

      {step === 'review' ? (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-1" />
            I have read the key facts, including the APR, fees and the {kfs.coolingOffDays}-day cooling-off period.
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => router.push(`/offers/${id}`)}>Not now</Button>
            <Button disabled={!read || busy} onClick={accept}>{busy ? 'Sending OTP…' : 'Accept'}</Button>
          </div>
        </>
      ) : null}

      {step === 'otp' && otpInfo ? (
        <Surface className="flex flex-col gap-3">
          <label htmlFor="otp" className="text-sm">{kfs.lenderOrInsurer} sent a 6-digit OTP to {otpInfo.sentTo} to e-sign the agreement</label>
          <input
            id="otp"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="h-12 rounded-sm border border-border bg-raised px-3 text-lg tracking-[0.4em] tabular"
          />
          <p className="text-xs text-muted">Demo: your OTP is {otpInfo.demoOtp} (any 6 digits work).</p>
          <Button disabled={otp.length !== 6 || busy} onClick={confirm}>{busy ? 'Signing…' : 'Confirm and sign'}</Button>
        </Surface>
      ) : null}

      {step === 'waiting' ? <p className="text-sm text-muted">Signed. Waiting for {kfs.lenderOrInsurer} to approve and set up your EMIs…</p> : null}
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <KeyFacts />
    </Suspense>
  );
}
