'use client';

import { credApi, formatBps, formatInr, type EndpointResponse } from '@cred/types';
import { Surface } from '@cred/ui';
import { useEffect, useState } from 'react';
import { credAdmin } from '@/lib/api';

type Rules = EndpointResponse<typeof credApi.admin.rules>;

/** Every threshold, cap and rate the engine uses. Read-only until M6. */
export default function RulesPage() {
  const [data, setData] = useState<Rules | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    credAdmin(credApi.admin.rules).then(setData, (e) => setError(e instanceof Error ? e.message : 'cred-api unreachable'));
  }, []);

  if (error) return <p className="p-6 text-negative">{error}</p>;
  if (!data) return <p className="p-6 text-muted">Loading…</p>;
  const groups = [...new Set(data.rules.map((r) => r.group))];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Engine rule settings</h1>
        <p className="text-sm text-muted">{data.editable ? 'Editable.' : 'Read-only. Editing arrives with the control room in M6.'}</p>
      </header>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{g}</h2>
          <Surface className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {data.rules
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <tr key={r.key}>
                      <td className="w-1/4 px-4 py-3 font-medium">{r.label}</td>
                      <td className="w-32 px-4 py-3 text-right font-semibold tabular">{r.display}</td>
                      <td className="px-4 py-3 text-muted">{r.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{r.key}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Surface>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Earned Credit Ladder</h2>
        <Surface className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr><th className="px-4 py-2">Tier</th><th className="px-4 py-2">On-time months</th><th className="px-4 py-2 text-right">Limit</th><th className="px-4 py-2 text-right">Rate</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.ladder.map((t) => (
                <tr key={t.tier}>
                  <td className="px-4 py-2 capitalize">{t.tier}</td>
                  <td className="px-4 py-2 tabular">{t.requiredOnTimeMonths}</td>
                  <td className="px-4 py-2 text-right tabular">{formatInr(t.limitPaise)}</td>
                  <td className="px-4 py-2 text-right tabular">{formatBps(t.ratePaBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      </section>
    </main>
  );
}
