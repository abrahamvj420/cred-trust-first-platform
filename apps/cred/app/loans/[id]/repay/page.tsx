'use client';

import { credApi, formatInr, type PrepaymentQuote } from '@cred/types';
import { Button, Card, Choice, ErrorState, Field, LoadingScreen, Money, Notice, Spinner } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useApi, useLive } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

/** Repay early: the lender's charges and the interest saved are shown before confirming. */
export default function Repay() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const loan = useApi(credApi.products.loan, { params: { loanId: id } }, { live: false });
  const { subscribe } = useLive();
  const [mode, setMode] = useState<'part' | 'full' | null>(null);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PrepaymentQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = loan.data?.loan;
  const paise = Math.round(Number(amount.replace(/,/g, '')) * 100);

  useEffect(() => {
    setQuote(null);
    if (!mode || (mode === 'part' && paise < 100)) return;
    const t = setTimeout(async () => {
      try {
        setError(null);
        setQuote(await api(credApi.products.prepaymentQuote, { params: { loanId: id }, query: mode === 'full' ? { full: 'true' } : { amountPaise: paise } }));
      } catch (e) {
        setError(errorText(e));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [mode, paise, id]);

  useEffect(() => {
    if (!waiting) return;
    return subscribe((e) => {
      if (e.type === 'loan.updated') router.push(`/loans/${id}`);
    });
  }, [waiting, subscribe, router, id]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.prepay, { params: { loanId: id }, body: mode === 'full' ? { full: true } : { amountPaise: paise, full: false } });
      setWaiting(true);
      setTimeout(() => router.push(`/loans/${id}`), 4000);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Repay early"
      back={`/loans/${id}`}
      footer={
        quote && !waiting ? (
          <Button block loading={busy} onClick={confirm}>
            Pay <Money paise={quote.totalToPayPaise} /> from my bank
          </Button>
        ) : null
      }
    >
      {loan.error && !l ? (
        <ErrorState message={loan.error} onRetry={loan.reload} />
      ) : !l ? (
        <LoadingScreen label="Loading loan" />
      ) : waiting ? (
        <Card className="flex items-center gap-3">
          <Spinner label="Waiting for the lender" />
          <p className="text-callout">Paid. {l.lenderName} is confirming and updating your schedule…</p>
        </Card>
      ) : (
        <>
          <Card className="flex items-baseline justify-between">
            <span className="text-callout text-muted">Still to repay to {l.lenderName}</span>
            <Money paise={l.principalOutstandingPaise} size="title" />
          </Card>
          <Choice
            legend="How much?"
            name="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'part', title: 'Part of it', detail: 'Your EMI stays about the same; the loan ends sooner' },
              { value: 'full', title: 'All of it', detail: 'Close the loan now' },
            ]}
          />
          {mode === 'part' ? (
            <Field label="Amount to repay" prefix="₹" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} hint={`Up to ${formatInr(l.principalOutstandingPaise)}`} autoFocus />
          ) : null}
          {quote ? (
            <Card elevation={2} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <Money paise={quote.interestSavedPaise} size="title" className="text-positive" />
                <span className="text-callout text-muted">less interest</span>
              </div>
              <dl className="flex flex-col gap-1 text-callout">
                <div className="flex justify-between">
                  <dt className="text-muted">Repaid now</dt>
                  <dd>
                    <Money paise={quote.amountPaise} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Charges</dt>
                  <dd>
                    <Money paise={quote.chargesPaise} />
                  </dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>You pay</dt>
                  <dd>
                    <Money paise={quote.totalToPayPaise} />
                  </dd>
                </div>
              </dl>
              <p className="text-caption text-muted">
                {quote.chargesNote} {quote.full ? 'The loan closes once the lender confirms.' : `${quote.remainingInstalments} EMIs left, ending ${quote.newEndDate ? longDate(quote.newEndDate) : ''}.`}
              </p>
            </Card>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
