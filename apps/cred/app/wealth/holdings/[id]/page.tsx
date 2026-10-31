'use client';

import { credApi } from '@cred/types';
import { Badge, Button, ButtonLink, Card, ErrorState, LoadingScreen, Money, Notice } from '@cred/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate, rate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

const CLASS: Record<string, string> = { equity: 'Equity fund', debt: 'Debt fund', hybrid: 'Hybrid fund', gold: 'Gold', fixed_deposit: 'Fixed deposit' };

export default function HoldingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useApi(credApi.products.holding, { params: { holdingId: id } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = q.data?.holding;

  async function remove() {
    setBusy(true);
    try {
      await api(credApi.products.removeHolding, { params: { holdingId: id } });
      router.push('/wealth');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const gain = h ? h.valuePaise - h.costPaise : 0;
  return (
    <Screen title={h ? CLASS[h.assetClass] : 'Holding'} back="/wealth" footer={h ? <ButtonLink href={`/wealth/holdings/${id}/sell`} block variant="secondary">Sell some</ButtonLink> : null}>
      {q.error && !h ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !h ? (
        <LoadingScreen label="Loading holding" />
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-2">
            <p className="text-callout">{h.name}</p>
            <Money paise={h.valuePaise} size="display" />
            <p className={`text-callout ${gain >= 0 ? 'text-positive' : 'text-negative'}`}>
              {gain >= 0 ? 'Up' : 'Down'} <Money paise={Math.abs(gain)} /> on <Money paise={h.costPaise} />
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge>{h.source === 'aa' ? 'Linked via SimAA' : 'Declared by you'}</Badge>
              {h.pledged ? <Badge tone="warning">Part pledged for a loan</Badge> : null}
            </div>
          </Card>
          <Card className="p-0">
            <dl className="divide-y divide-border text-callout">
              {[
                ['Held with', h.provider],
                ...(h.units !== null ? [[h.kind === 'gold' ? 'Grams' : 'Units', h.units.toLocaleString('en-IN')]] : []),
                ['Since', longDate(h.acquiredAt)],
                ['Expected return', `${rate(h.expectedReturnBps)} a year (not guaranteed)`],
                ...(h.expenseRatioBps !== null ? [['Fund fee (expense ratio)', `${rate(h.expenseRatioBps)} a year`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular text-right">{v}</dd>
                </div>
              ))}
              <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Fees this year</dt>
                <dd className="tabular">
                  <Money paise={h.annualFeePaise} />
                </dd>
              </div>
            </dl>
          </Card>
          <p className="text-caption text-muted">Thinking of selling? We’ll show what selling would cost in tax and returns you’d give up, next to borrowing against it, before you decide.</p>
          {h.source === 'self_declared' && !h.pledged ? (
            <Button variant="quiet" loading={busy} onClick={remove}>
              Remove this holding
            </Button>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
