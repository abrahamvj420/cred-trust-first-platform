'use client';

import { credApi, type MemberAlert } from '@cred/types';
import { Avatar, EmptyState, ErrorState, LoadingScreen } from '@cred/ui';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const ICON: Record<MemberAlert['kind'], 'chart' | 'loan' | 'bell' | 'doc' | 'trend' | 'check' | 'shield'> = {
  market_fall: 'chart',
  collateral: 'loan',
  renewal: 'bell',
  claim: 'doc',
  ladder: 'trend',
  income: 'check',
  loan: 'loan',
  policy: 'shield',
};

/** Alerts are information (a market move, a claim update, a tier unlocked), never offers. */
export default function Alerts() {
  const q = useApi(credApi.products.alerts);
  const unread = q.data?.alerts.filter((a) => !a.read).map((a) => a.id).join(',') ?? '';

  // Opening the list marks what was shown as read
  useEffect(() => {
    if (!unread) return;
    void Promise.all(unread.split(',').map((alertId) => api(credApi.products.readAlert, { params: { alertId } }).catch(() => undefined)));
  }, [unread]);

  return (
    <Screen title="Alerts" back="/">
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading alerts" />
      ) : !q.data.alerts.length ? (
        <EmptyState icon="bell" title="Nothing new" body="Updates on your money, cover and claims show up here. We never use this for offers." />
      ) : (
        <div className="flex flex-col gap-3">
          {q.data.alerts.map((a) => {
            const body = (
              <div className={`flex gap-3 rounded-lg border bg-surface p-4 shadow-e1 transition-calm ${a.read ? 'border-border' : 'border-accent/50'} ${a.href ? 'hover:border-muted' : ''}`}>
                <Avatar icon={ICON[a.kind]} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-headline">{a.title}</p>
                  <p className="text-callout text-muted">{a.body}</p>
                  <p className="mt-1 text-caption text-muted">{dateTime(a.createdAt)}</p>
                </div>
              </div>
            );
            return a.href ? (
              <a key={a.id} href={a.href} className="block rounded-lg">
                {body}
              </a>
            ) : (
              <div key={a.id}>{body}</div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
