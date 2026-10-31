'use client';

import { AcceptOption, credApi } from '@cred/types';
import { Button, Card, ErrorState, Field, Icon, LoadingScreen, Notice, Spinner } from '@cred/ui';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { useApi, useLive } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

type Step = 'review' | 'otp' | 'waiting';

function KeyFacts() {
  const { id } = useParams<{ id: string }>();
  const option = AcceptOption.catch('emi').parse(useSearchParams().get('option'));
  const insurance = option === 'policy' || option === 'policy_alt';
  const router = useRouter();
  const kfs = useApi(credApi.products.keyFacts, { params: { offerId: id }, query: { option } }, { live: false });
  const { subscribe } = useLive();
  const [read, setRead] = useState(false); // never pre-ticked
  const [step, setStep] = useState<Step>('review');
  const [otpInfo, setOtpInfo] = useState<{ sentTo: string; demoOtp: string; purpose: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the lender's disbursal webhook lands, cred-api pushes loan.updated.
  useEffect(() => {
    if (step !== 'waiting') return;
    if (insurance) {
      // The insurer issues the policy and tells cred-api by webhook; the Protect screen shows it live
      const t = setTimeout(() => router.push('/protect?issued=1'), 1200);
      return () => clearTimeout(t);
    }
    const go = async () => {
      const loan = (await api(credApi.products.loans)).loans.find((l) => l.offerId === id);
      if (loan?.status === 'disbursed') router.push(`/loans/${loan.id}`);
    };
    void go();
    const off = subscribe((e) => e.type === 'loan.updated' && void go());
    const t = setInterval(go, 2000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [step, id, router, subscribe, insurance]);

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
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const k = kfs.data;
  const footer =
    step === 'review' && k ? (
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => router.push(`/offers/${id}`)}>
          Not now
        </Button>
        <Button disabled={!read} loading={busy} onClick={accept}>
          Accept
        </Button>
      </div>
    ) : step === 'otp' ? (
      <Button block disabled={otp.length !== 6} loading={busy} onClick={confirm}>
        {insurance ? 'Confirm and pay premium' : 'Confirm and sign'}
      </Button>
    ) : null;

  return (
    <Screen title="Key facts" back={`/offers/${id}`} footer={footer}>
      {kfs.error && !k ? (
        <ErrorState message={kfs.error} onRetry={kfs.reload} />
      ) : !k ? (
        <LoadingScreen label="Loading key facts" />
      ) : (
        <>
          <p className="text-callout text-muted">Read these before you accept. They’re the full cost, including {insurance ? 'tax and waiting periods' : 'fees and GST'}.</p>
          {k.highlights.length ? (
            <Card className="flex flex-col gap-2">
              {k.highlights.map((h) => (
                <p key={h} className="flex gap-3 text-callout">
                  <Icon name="info" size={18} className="mt-0.5 shrink-0 text-accent" />
                  {h}
                </p>
              ))}
            </Card>
          ) : null}
          <Card className="p-0">
            <dl className="divide-y divide-border">
              {k.items.map((i) => (
                <div key={i.label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-callout">
                  <dt className="text-muted">{i.label}</dt>
                  <dd className="tabular text-right">{i.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <p className="text-caption text-muted">Grievances: {k.grievanceContact}</p>

          {step === 'review' ? (
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-4 text-callout">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-current text-accent" />
              {insurance
                ? `I’ve read the key facts, including the waiting periods${k.coolingOffDays ? ` and the ${k.coolingOffDays}-day free look` : ''}.`
                : `I’ve read the key facts, including the APR, fees and the ${k.coolingOffDays}-day cooling-off period.`}
            </label>
          ) : null}

          {step === 'otp' && otpInfo ? (
            <Card className="flex flex-col gap-3">
              <Field
                label={`${otpInfo.purpose}: enter the 6-digit OTP ${k.lenderOrInsurer} sent to ${otpInfo.sentTo}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                inputClassName="text-center text-title tracking-[0.4em]"
                hint={`Demo: your OTP is ${otpInfo.demoOtp} (any 6 digits work).`}
                autoFocus
              />
            </Card>
          ) : null}

          {step === 'waiting' ? (
            <Card className="flex items-center gap-3">
              <Spinner label={insurance ? 'Waiting for the insurer' : 'Waiting for the lender'} />
              <p className="text-callout">{insurance ? `Confirmed. ${k.lenderOrInsurer} is issuing your policy…` : `Signed. ${k.lenderOrInsurer} is approving and setting up your EMIs…`}</p>
            </Card>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          <p className="flex items-center gap-2 text-caption text-muted">
            <Icon name="shield" size={16} /> Your details go to {k.lenderOrInsurer} only when you accept.
          </p>
        </>
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <KeyFacts />
    </Suspense>
  );
}
