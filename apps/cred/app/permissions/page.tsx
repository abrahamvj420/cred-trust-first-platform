'use client';

import { credApi, type AaPurpose, type PermissionScope } from '@cred/types';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingScreen, Notice, SectionHeader } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const ABOUT: Record<PermissionScope, { title: string; body: string }> = {
  smart_savings: { title: 'Smart Savings', body: 'CRED looks at your card bills and suggests savings, only when you gain in rupees, one at a time.' },
  income_data: { title: 'Salary (via Account Aggregator)', body: 'Your monthly salary, verified once from your bank, used for better limits and rates. Turning this off deletes it.' },
  health_data: { title: 'Activity summary', body: 'One weekly activity score from your health app, used for insurance wellness rewards. Turning this off stops sharing and deletes the summaries.' },
  portfolio_data: { title: 'Investments (via Account Aggregator)', body: 'Your funds and deposits, for tracking, goals and sell-vs-borrow comparisons. Turning this off deletes the linked holdings.' },
  insurance_data: { title: 'Insurance policies (via Account Aggregator)', body: 'Your policies, including employer cover, used to check for gaps in your cover. Turning this off deletes them.' },
};
const PURPOSE: Record<AaPurpose, string> = { income_verification: 'Salary verification', portfolio_tracking: 'Investments', protection_review: 'Insurance policies' };

/** One-tap withdraw for every permission and every Account Aggregator link. Each action is logged. */
export default function PermissionsPage() {
  const q = useApi(credApi.member.permissions);
  const aa = useApi(credApi.member.aaConsents);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      q.reload();
      aa.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(null);
  }

  const links = aa.data?.consents.filter((c) => c.status === 'ACTIVE') ?? [];
  return (
    <Screen title="Permissions" back="/profile/privacy">
      <p className="text-callout text-muted">Requests you make yourself never need a permission. These cover what CRED does on your behalf, and the data you chose to share.</p>
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading permissions" />
      ) : (
        <>
          {q.data.permissions.length === 0 ? (
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
                ) : p.withdrawnAt ? (
                  <p className="text-caption text-muted">Turned off {longDate(p.withdrawnAt.slice(0, 10))}</p>
                ) : null}
                {p.status === 'granted' ? (
                  <Button variant="secondary" loading={busy === p.scope} onClick={() => run(p.scope, () => api(credApi.member.withdrawPermission, { params: { scope: p.scope } }))}>
                    Turn off
                  </Button>
                ) : null}
              </Card>
            ))
          )}
          <SectionHeader title="Account Aggregator links" />
          {links.length ? (
            links.map((c) => (
              <Card key={c.id} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-headline">{PURPOSE[c.purpose]}</h2>
                  <Badge tone="positive">Linked</Badge>
                </div>
                <p className="text-caption text-muted">
                  Through SimAA since {longDate(c.createdAt.slice(0, 10))}
                  {c.expiresAt ? ` · until ${longDate(c.expiresAt.slice(0, 10))}` : ''}
                </p>
                <Button variant="secondary" loading={busy === c.id} onClick={() => run(c.id, () => api(credApi.member.revokeAaConsent, { params: { consentId: c.id } }))}>
                  Unlink and delete
                </Button>
              </Card>
            ))
          ) : (
            <Card className="text-callout text-muted">No active links. You choose what to link when you use a feature that needs it.</Card>
          )}
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
