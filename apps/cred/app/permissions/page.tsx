'use client';

import { credApi, type PermissionScope } from '@cred/types';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingScreen } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const ABOUT: Record<PermissionScope, { title: string; body: string }> = {
  smart_savings: { title: 'Smart Savings', body: 'CRED looks at your card bills and suggests savings, only when you gain in rupees, one at a time.' },
  income_data: { title: 'Income (via Account Aggregator)', body: 'Your salary credits, used to offer better limits and rates.' },
  health_data: { title: 'Activity summary', body: 'A weekly activity score from your health app, used for insurance wellness rewards.' },
  portfolio_data: { title: 'Investments (via Account Aggregator)', body: 'Your funds and deposits, for tracking and sell-vs-borrow comparisons.' },
};

/** One-tap withdraw. The full privacy centre arrives in M6. */
export default function PermissionsPage() {
  const q = useApi(credApi.member.permissions);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(scope: PermissionScope) {
    setBusy(scope);
    setError(null);
    try {
      await api(credApi.member.withdrawPermission, { params: { scope } });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(null);
  }

  return (
    <Screen title="Permissions" back="/profile">
      <p className="text-callout text-muted">Requests you make yourself never need a permission. These cover what CRED does on your behalf.</p>
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading permissions" />
      ) : q.data.permissions.length === 0 ? (
        <EmptyState icon="shield" title="Nothing allowed yet" body="You haven’t given CRED any optional permissions." />
      ) : (
        q.data.permissions.map((p) => (
          <Card key={p.scope} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-headline">{ABOUT[p.scope].title}</h2>
              <Badge tone={p.status === 'granted' ? 'positive' : 'neutral'}>{p.status === 'granted' ? 'On' : 'Off'}</Badge>
            </div>
            <p className="text-callout text-muted">{ABOUT[p.scope].body}</p>
            {p.status === 'granted' && p.grantedAt ? (
              <p className="text-caption text-muted">
                Turned on {longDate(p.grantedAt.slice(0, 10))}
                {p.context ? ` · ${p.context}` : ''}
              </p>
            ) : null}
            {p.status === 'granted' ? (
              <Button variant="secondary" loading={busy === p.scope} onClick={() => withdraw(p.scope)}>
                Turn off
              </Button>
            ) : null}
          </Card>
        ))
      )}
      {error ? <p className="text-callout text-negative">{error}</p> : null}
    </Screen>
  );
}
