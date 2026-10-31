'use client';

import { credApi } from '@cred/types';
import { Button, Card, ErrorState, Icon, LoadingScreen, Money, Spinner } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

/** After the UPI PIN page: waits for the switch's result (pushed live), then shows the outcome. */
export default function UpiStatus() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(credApi.member.upiStatus, { params: { paymentId: id } });
  const p = q.data?.payment;

  // Belt and braces: poll briefly in case the live event arrived before we connected.
  useEffect(() => {
    if (p?.status !== 'awaiting_pin') return;
    const t = setInterval(q.reload, 1500);
    return () => clearInterval(t);
  }, [p?.status, q.reload]);

  const footer =
    p && p.status !== 'awaiting_pin' ? (
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => (window.location.href = '/upi')}>
          {p.status === 'failed' ? 'Try again' : 'Pay someone else'}
        </Button>
        <Button onClick={() => (window.location.href = '/')}>Done</Button>
      </div>
    ) : null;

  return (
    <Screen footer={footer}>
      {q.error && !p ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !p ? (
        <LoadingScreen label="Checking payment" />
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            {p.status === 'awaiting_pin' ? (
              <span className="grid h-20 w-20 place-items-center rounded-full bg-raised text-muted">
                <Spinner size={36} label="Waiting for your bank" />
              </span>
            ) : p.status === 'success' ? (
              <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-positive/15 text-positive">
                <Icon name="check" size={40} />
              </span>
            ) : (
              <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-negative/15 text-negative">
                <Icon name="close" size={36} />
              </span>
            )}
            <p className="text-callout text-muted">
              {p.status === 'awaiting_pin' ? 'Waiting for your bank…' : p.status === 'success' ? 'Paid' : 'Payment didn’t go through'}
            </p>
            <Money paise={p.amountPaise} size="display" />
            <p className="text-callout text-muted">to {p.payeeName ?? p.payeeVpa}</p>
            {p.status === 'failed' && p.failureReason ? <p className="max-w-[30ch] text-callout">{p.failureReason}. No money has left your account.</p> : null}
          </div>
          <Card>
            <dl className="grid grid-cols-2 gap-y-3 text-callout">
              <dt className="text-muted">To</dt>
              <dd className="truncate text-right">{p.payeeVpa}</dd>
              <dt className="text-muted">From</dt>
              <dd className="truncate text-right">{p.payerVpa}</dd>
              {p.note ? (
                <>
                  <dt className="text-muted">Note</dt>
                  <dd className="text-right">{p.note}</dd>
                </>
              ) : null}
              <dt className="text-muted">When</dt>
              <dd className="text-right">{dateTime(p.createdAt)}</dd>
              {p.rrn ? (
                <>
                  <dt className="text-muted">UPI ref (RRN)</dt>
                  <dd className="text-right font-mono text-caption">{p.rrn}</dd>
                </>
              ) : null}
            </dl>
          </Card>
        </>
      )}
    </Screen>
  );
}
