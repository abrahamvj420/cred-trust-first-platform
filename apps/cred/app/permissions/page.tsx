'use client';

import { credApi, type Permission, type PermissionScope } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';

const ABOUT: Record<PermissionScope, { title: string; body: string }> = {
  smart_savings: { title: 'Smart Savings', body: 'CRED looks at your card bills and suggests savings, only when you gain in rupees, one at a time.' },
  income_data: { title: 'Income (via Account Aggregator)', body: 'Your salary credits, used to offer better limits and rates.' },
  health_data: { title: 'Activity summary', body: 'A weekly activity score from your health app, used for insurance wellness rewards.' },
  portfolio_data: { title: 'Investments (via Account Aggregator)', body: 'Your funds and deposits, for tracking and sell-vs-borrow comparisons.' },
};

/** One-tap withdraw. The full privacy centre arrives in M6. */
export default function PermissionsPage() {
  const [perms, setPerms] = useState<Permission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api(credApi.member.permissions).then((r) => setPerms(r.permissions), (e) => setError(errorText(e))), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function withdraw(scope: PermissionScope) {
    await api(credApi.member.withdrawPermission, { params: { scope } });
    void load();
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <a href="/" className="text-sm text-muted">← Home</a>
      <h1 className="text-2xl font-semibold">Permissions</h1>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
      {perms?.length === 0 ? <p className="text-sm text-muted">You haven’t given CRED any optional permissions.</p> : null}
      {perms?.map((p) => (
        <Surface key={p.scope} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{ABOUT[p.scope].title}</h2>
            <span className={`text-xs font-semibold ${p.status === 'granted' ? 'text-positive' : 'text-muted'}`}>{p.status === 'granted' ? 'On' : 'Off'}</span>
          </div>
          <p className="text-sm text-muted">{ABOUT[p.scope].body}</p>
          {p.context ? <p className="text-xs text-muted">Given at: {p.context}</p> : null}
          {p.status === 'granted' ? <Button variant="secondary" onClick={() => withdraw(p.scope)}>Turn off</Button> : null}
        </Surface>
      ))}
    </main>
  );
}
