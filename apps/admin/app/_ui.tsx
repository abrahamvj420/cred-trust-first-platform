'use client';

import { AdminStreamEvent, type EngineDecision } from '@cred/types';
import { Money, Surface } from '@cred/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CRED_API, staffSession } from '@/lib/api';

/** Load console data and refresh it whenever cred-api pushes an admin event. */
export function useAdmin<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const loader = useRef(load);
  loader.current = load;
  const refresh = useCallback(async () => {
    try {
      setData(await loader.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'cred-api unreachable');
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void refresh(), deps);
  useEffect(() => {
    const token = staffSession.get();
    if (!token) return;
    const es = new EventSource(`${CRED_API}/admin/v1/stream?token=${encodeURIComponent(token)}`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      if (!AdminStreamEvent.safeParse(JSON.parse(m.data)).success) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250); // coalesce bursts (a month of the clock is dozens of events)
    };
    return () => es.close();
  }, [refresh]);
  return { data, error, live, refresh };
}

export function Page({ title, subtitle, live, actions, children }: { title: string; subtitle?: string; live?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-4">
          {actions}
          {live === undefined ? null : <span className={`text-xs ${live ? 'text-positive' : 'text-warning'}`}>{live ? '● live' : '● connecting'}</span>}
        </div>
      </header>
      {children}
    </main>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONE = { muted: 'text-muted', positive: 'text-positive', negative: 'text-negative', warning: 'text-warning', accent: 'text-accent' } as const;

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'positive' | 'negative' | 'warning' }) {
  return (
    <Surface className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-2xl font-semibold tabular ${tone ? TONE[tone] : ''}`}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Surface>
  );
}

export function DataTable({ head, rows, empty = 'Nothing yet', align }: { head: string[]; rows: ReactNode[][]; empty?: string; align?: ('left' | 'right')[] }) {
  return (
    <Surface className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-4 py-2 font-medium ${align?.[i] === 'right' ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2 ${align?.[j] === 'right' ? 'text-right tabular' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{empty}</p> : null}
    </Surface>
  );
}

export function Tag({ tone = 'muted', children }: { tone?: 'muted' | 'positive' | 'negative' | 'warning' | 'accent'; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs ${TONE[tone]}`}>{children}</span>;
}

export const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
export const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
export const feature = (f: string) => f.replaceAll('_', ' ');

const OUTCOME_TONE = { offer: 'positive', blocked: 'muted', help: 'warning', available: 'accent' } as const;

/** One engine decision: the technical checks next to what the member was told. */
export function DecisionCard({ d }: { d: EngineDecision & { memberName: string } }) {
  return (
    <Surface className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-xs text-muted">{time(d.createdAt)}</span>
        <span className="font-semibold">{d.memberName}</span>
        <Tag>{feature(d.feature)}</Tag>
        <Tag tone={OUTCOME_TONE[d.outcome]}>{d.outcome === 'help' ? 'help, not credit' : d.outcome}</Tag>
        <span className="font-mono text-xs text-muted">{d.reasons.join(', ')}</span>
        {d.netBenefitPaise ? (
          <span>
            saves <Money paise={d.netBenefitPaise} />
          </span>
        ) : null}
        {d.origin === 'member_initiated' ? <span className="text-xs text-accent">member asked</span> : null}
      </div>
      <p className="text-sm">
        <span className="text-muted">Member sees: </span>
        {d.explanation}
      </p>
      <ol className="grid gap-1 text-xs lg:grid-cols-2">
        {d.checks.map((c) => (
          <li key={c.check} className="flex gap-2">
            <span className={c.passed ? 'text-positive' : c.reason === 'awaiting_permission' ? 'text-warning' : 'text-negative'}>{c.passed ? '✓' : c.reason === 'awaiting_permission' ? '…' : '✗'}</span>
            <span className="font-mono">{c.check}</span>
            <span className="text-muted">{c.detail}</span>
          </li>
        ))}
      </ol>
    </Surface>
  );
}
