'use client';

import { AdminStreamEvent, credApi, type EndpointResponse } from '@cred/types';
import { Money, Surface } from '@cred/ui';
import { useCallback, useEffect, useState } from 'react';
import { CRED_API, credAdmin } from '@/lib/api';

type R<E> = EndpointResponse<E>;
interface Data {
  txns: R<typeof credApi.admin.transactions>['transactions'];
  decisions: R<typeof credApi.admin.decisions>['decisions'];
  perms: R<typeof credApi.admin.permissionLog>['entries'];
  loans: R<typeof credApi.admin.loans>['loans'];
  hooks: R<typeof credApi.admin.webhooks>['webhooks'];
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const OUTCOME: Record<string, string> = { offer: 'text-positive', blocked: 'text-muted', help: 'text-warning' };

export function LiveConsole() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = { query: { limit: 25 } };
      const [t, d, p, l, w] = await Promise.all([
        credAdmin(credApi.admin.transactions, q),
        credAdmin(credApi.admin.decisions, q),
        credAdmin(credApi.admin.permissionLog, q),
        credAdmin(credApi.admin.loans, q),
        credAdmin(credApi.admin.webhooks, q),
      ]);
      setData({ txns: t.transactions, decisions: d.decisions, perms: p.entries, loans: l.loans, hooks: w.webhooks });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'cred-api unreachable');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const es = new EventSource(`${CRED_API}/admin/v1/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      if (AdminStreamEvent.safeParse(JSON.parse(m.data)).success) void refresh();
    };
    return () => es.close();
  }, [refresh]);

  if (error) return <p className="p-6 text-negative">{error}</p>;
  if (!data) return <p className="p-6 text-muted">Loading…</p>;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Live overview</h1>
        <span className={`text-xs ${connected ? 'text-positive' : 'text-negative'}`}>{connected ? '● live' : '● reconnecting'}</span>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Engine decisions (including blocked)</h2>
        <div className="flex flex-col gap-2">
          {data.decisions.map((d) => (
            <Surface key={d.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-xs text-muted">{time(d.createdAt)}</span>
                <span className="font-semibold">{d.memberName}</span>
                <span className="font-mono text-xs">{d.feature}</span>
                <span className={`font-semibold uppercase ${OUTCOME[d.outcome]}`}>
                  {d.outcome === 'help' ? 'blocked: stress → help' : d.outcome}
                </span>
                <span className="font-mono text-xs text-muted">{d.reasons.join(', ')}</span>
                {d.netBenefitPaise ? <span>saves <Money paise={d.netBenefitPaise} /></span> : null}
                {d.origin === 'member_initiated' ? <span className="text-xs text-accent">member asked</span> : null}
              </div>
              <p className="text-sm"><span className="text-muted">Member sees: </span>{d.explanation}</p>
              <ol className="grid gap-1 text-xs sm:grid-cols-2">
                {d.checks.map((c) => (
                  <li key={c.check} className="flex gap-2">
                    <span className={c.passed ? 'text-positive' : c.reason === 'awaiting_permission' ? 'text-warning' : 'text-negative'}>{c.passed ? '✓' : c.reason === 'awaiting_permission' ? '…' : '✗'}</span>
                    <span className="font-mono">{c.check}</span>
                    <span className="text-muted">{c.detail}</span>
                  </li>
                ))}
              </ol>
            </Surface>
          ))}
          {data.decisions.length === 0 ? <p className="text-sm text-muted">No decisions yet.</p> : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Transactions ingested" empty="No transactions" rows={data.txns.map((t) => [time(t.postedAt), t.memberName, t.merchant, <Money key="m" paise={t.amountPaise} />])} />
        <Table title="Permission log" empty="No permission events" rows={data.perms.map((p) => [time(p.at), p.memberId ?? '—', p.action, p.target ?? ''])} />
        <Table
          title="Loans"
          empty="No loans"
          rows={data.loans.map((l) => [time(l.createdAt), l.memberName, `${l.lenderName} · ${l.status}`, <Money key="m" paise={l.principalPaise} />])}
        />
        <Table
          title="Partner webhooks"
          empty="No webhooks"
          rows={data.hooks.map((w) => [time(w.receivedAt), w.type, w.signatureOk ? 'signature ok' : 'rejected', w.duplicate ? 'duplicate ignored' : ''])}
        />
      </div>
    </main>
  );
}

function Table({ title, rows, empty }: { title: string; rows: React.ReactNode[][]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <Surface className="p-0">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-mono text-xs text-muted' : ''} ${j === r.length - 1 ? 'text-right' : ''}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{empty}</p> : null}
      </Surface>
    </section>
  );
}
