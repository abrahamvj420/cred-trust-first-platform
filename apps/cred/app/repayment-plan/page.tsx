'use client';

import { credApi, type RepaymentPlanOption } from '@cred/types';
import { Button, Card, Choice, ErrorState, Field, Icon, LoadingScreen, Money, Notice, Spinner } from '@cred/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { rate } from '@/lib/format';
import { useApi, useLive } from '@/lib/live';
import { Screen } from '../_shell/Screen';

type Months = '3' | '6' | '12';

/** A repayment plan: clear what you owe in fixed monthly amounts, at a far lower rate than the card. Help, not new credit. */
export default function RepaymentPlan() {
  const router = useRouter();
  const q = useApi(credApi.products.repaymentPlan, undefined, { live: false });
  const { subscribe } = useLive();
  const [months, setMonths] = useState<Months | null>(null);
  const [read, setRead] = useState(false); // never pre-ticked
  const [otpInfo, setOtpInfo] = useState<{ loanId: string; sentTo: string; demoOtp: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = q.data;
  const chosen: RepaymentPlanOption | undefined = v?.options.find((o) => String(o.months) === months);

  useEffect(() => {
    if (!waiting || !otpInfo) return;
    const go = () => router.push(`/loans/${otpInfo.loanId}`);
    const off = subscribe((e) => e.type === 'loan.updated' && go());
    const t = setTimeout(go, 4000);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [waiting, otpInfo, router, subscribe]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.products.startRepaymentPlan, { body: { months: Number(months) as 3, termsAcknowledged: true } });
      setOtpInfo({ loanId: r.loanId, ...r.otp });
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.confirmRepaymentPlan, { params: { loanId: otpInfo!.loanId }, body: { otp } });
      setWaiting(true);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const footer = !v?.eligible || waiting ? null : otpInfo ? (
    <Button block loading={busy} disabled={otp.length !== 6} onClick={confirm}>
      Confirm my plan
    </Button>
  ) : (
    <Button block loading={busy} disabled={!chosen || !read} onClick={start}>
      Set up this plan
    </Button>
  );

  return (
    <Screen title="A plan for your balance" back="/" footer={footer}>
      {q.error && !v ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !v ? (
        <LoadingScreen label="Loading your options" />
      ) : waiting ? (
        <Card className="flex items-center gap-3">
          <Spinner label="Setting up your plan" />
          <p className="text-callout">Confirmed. {v.lenderName} is paying off your card and setting up your plan…</p>
        </Card>
      ) : !v.eligible ? (
        <Card className="flex flex-col gap-3">
          <p className="text-callout">{v.note}</p>
          {v.activeLoanId ? (
            <Button variant="secondary" onClick={() => router.push(`/loans/${v.activeLoanId}`)}>
              See my plan
            </Button>
          ) : null}
        </Card>
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-2">
            <p className="text-caption text-muted">On your card today</p>
            <Money paise={v.balancePaise} size="display" />
            <p className="text-callout text-muted">{v.note}</p>
          </Card>
          <Choice
            legend="Over how long?"
            name="months"
            value={months}
            onChange={(m) => {
              setMonths(m);
              setOtpInfo(null);
            }}
            options={v.options.map((o) => ({
              value: String(o.months) as Months,
              title: (
                <>
                  <Money paise={o.monthlyPaise} /> a month for {o.months} months
                </>
              ),
              detail: (
                <>
                  <Money paise={o.totalInterestPaise} /> interest in all, <Money paise={o.savingPaise} /> less than leaving it on your card
                </>
              ),
            }))}
          />
          {chosen ? (
            <Card className="flex flex-col gap-2">
              <dl className="flex flex-col gap-1 text-callout">
                {[
                  ['Who you repay', v.lenderName],
                  ['Rate', `${rate(chosen.ratePaBps)} a year (your card is 3.5% a month)`],
                  ['Fees', '₹0'],
                  ['Monthly amount', <Money key="m" paise={chosen.monthlyPaise} />],
                  ['Total interest', <Money key="i" paise={chosen.totalInterestPaise} />],
                  ['If it stayed on your card', <Money key="c" paise={chosen.cardInterestPaise} />],
                ].map(([k, val]) => (
                  <div key={String(k)} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="flex gap-2 text-caption text-muted">
                <Icon name="info" size={16} className="mt-0.5 shrink-0" /> {v.lenderName} pays off your card now. While you’re on the plan we won’t suggest any new credit, so you can focus on clearing it.
              </p>
            </Card>
          ) : null}
          {chosen && !otpInfo ? (
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-4 text-callout">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-current text-accent" />I understand the monthly amount, the rate and that there are no fees.
            </label>
          ) : null}
          {otpInfo ? (
            <Field
              label={`Enter the 6-digit OTP ${v.lenderName} sent to ${otpInfo.sentTo}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              inputClassName="text-center text-title tracking-[0.4em]"
              hint={`Demo: your OTP is ${otpInfo.demoOtp} (any 6 digits work).`}
              autoFocus
            />
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          <p className="text-caption text-muted">Rather talk it through first? <a className="text-accent underline" href="/help">Talk to us</a>.</p>
        </>
      )}
    </Screen>
  );
}
