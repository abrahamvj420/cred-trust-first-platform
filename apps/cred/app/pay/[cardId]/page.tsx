'use client';

import { credApi, formatInr, type BillPaymentSource, type EndpointResponse } from '@cred/types';
import { Button, Card, Choice, ErrorState, Field, Icon, LoadingScreen, Money, Notice } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { dueLabel, longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

type Amount = 'full' | 'minimum' | 'custom';
type Result = EndpointResponse<typeof credApi.member.payBill>;

/** Bill pay: full is preselected, so it's one tap from Home to Pay. Never blocked by offers. */
export default function PayBill() {
  const { cardId } = useParams<{ cardId: string }>();
  const detail = useApi(credApi.member.card, { params: { cardId } }, { live: false });
  const home = useApi(credApi.member.home, undefined, { live: false });
  const [amount, setAmount] = useState<Amount>('full');
  const [custom, setCustom] = useState('');
  const [source, setSource] = useState<BillPaymentSource>('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const d = detail.data;
  const due = d?.card.nextDue;

  if (done) return <Paid result={done} />;

  const remaining = due?.remainingPaise ?? 0;
  const minLeft = due ? Math.max(0, due.minDuePaise - due.paidPaise) : 0;
  const customPaise = Math.round(Number(custom.replace(/,/g, '')) * 100);
  const customError =
    amount !== 'custom' || custom === ''
      ? null
      : !Number.isFinite(customPaise) || customPaise < 100
        ? 'Enter at least ₹1'
        : d && customPaise > d.card.outstandingPaise
          ? `That’s more than your card balance of ${formatInr(d.card.outstandingPaise)}`
          : null;
  const payPaise = amount === 'full' ? remaining : amount === 'minimum' ? minLeft : customPaise;
  const canPay = !busy && payPaise > 0 && !customError && (amount !== 'custom' || custom !== '');

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.member.payBill, {
        params: { cardId },
        body: amount === 'custom' ? { kind: 'custom', amountPaise: customPaise, source } : { kind: amount, source },
      });
      setDone(r);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Pay card bill"
      back
      footer={
        d && remaining > 0 ? (
          <Button block onClick={pay} loading={busy} disabled={!canPay}>
            {busy ? 'Paying…' : <>Pay {payPaise > 0 ? <Money paise={payPaise} /> : null}</>}
          </Button>
        ) : null
      }
    >
      {detail.error && !d ? (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      ) : !d || !home.data ? (
        <LoadingScreen label="Loading your bill" />
      ) : !due || remaining === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-positive/15 text-positive">
            <Icon name="check" />
          </span>
          <p className="text-headline">Nothing to pay right now</p>
          <p className="text-callout text-muted">This card’s latest bill is fully paid.</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-1">
            <p className="text-callout text-muted">
              {d.card.issuerName} {d.card.network.toUpperCase()} ···· {d.card.last4}
            </p>
            <Money paise={remaining} size="display" />
            <p className="text-caption text-muted">{dueLabel(home.data.simDate, due.dueDate).text}</p>
          </Card>

          <Choice<Amount>
            legend="How much?"
            name="amount"
            value={amount}
            onChange={setAmount}
            options={[
              { value: 'full', title: due.status === 'partial' ? 'Remaining bill' : 'Full bill', detail: 'No interest', trailing: <Money paise={remaining} className="font-semibold" /> },
              ...(minLeft > 0 ? [{ value: 'minimum' as const, title: 'Minimum due', detail: 'Interest applies to the rest', trailing: <Money paise={minLeft} className="font-semibold" /> }] : []),
              { value: 'custom', title: 'Another amount', detail: 'Pay what works for you' },
            ]}
          />
          {amount === 'custom' ? (
            <Field label="Amount" prefix="₹" inputMode="decimal" placeholder="0" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ''))} error={customError} autoFocus />
          ) : null}
          {amount !== 'full' ? (
            <Notice tone="info">
              Anything left after {longDate(due.dueDate)} is charged interest at 3.5% a month plus GST. Paying in full avoids it.
            </Notice>
          ) : null}

          <Choice<BillPaymentSource>
            legend="Pay from"
            name="source"
            value={source}
            onChange={setSource}
            options={[
              { value: 'upi', title: 'UPI', detail: home.data.member.vpa },
              { value: 'netbanking', title: 'Net banking', detail: 'Mock Bank savings account' },
            ]}
          />
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}

function Paid({ result }: { result: Result }) {
  const { payment, card, coinsEarned } = result;
  const left = card.nextDue?.remainingPaise ?? 0;
  return (
    <Screen footer={<ButtonRow cardId={card.id} />}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-positive/15 text-positive">
          <Icon name="check" size={40} />
        </span>
        <p className="text-callout text-muted">Payment successful</p>
        <Money paise={payment.amountPaise} size="display" />
        <p className="text-callout text-muted">
          to {card.issuerName} ···· {card.last4}
        </p>
        {coinsEarned > 0 ? (
          <p className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-callout">
            <Icon name="gift" size={18} className="text-accent" /> +{coinsEarned.toLocaleString('en-IN')} coins for paying on time
          </p>
        ) : null}
      </div>
      <Card>
        <dl className="grid grid-cols-2 gap-y-3 text-callout">
          <dt className="text-muted">Paid via</dt>
          <dd className="text-right">{payment.source === 'netbanking' ? 'Net banking' : 'UPI'}</dd>
          <dt className="text-muted">Left on this bill</dt>
          <dd className="text-right">
            <Money paise={left} />
          </dd>
          <dt className="text-muted">On time</dt>
          <dd className="text-right">{payment.onTime ? 'Yes' : 'No'}</dd>
          <dt className="text-muted">Reference</dt>
          <dd className="truncate text-right font-mono text-caption">{payment.id}</dd>
        </dl>
      </Card>
    </Screen>
  );
}

function ButtonRow({ cardId }: { cardId: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="secondary" onClick={() => (window.location.href = `/cards/${cardId}`)}>
        View card
      </Button>
      <Button onClick={() => (window.location.href = '/')}>Done</Button>
    </div>
  );
}
