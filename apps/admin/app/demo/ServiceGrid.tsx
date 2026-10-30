'use client';

import { appEndpoints, type ServiceProbe } from '@cred/types';
import { StatusPill, Surface } from '@cred/ui';
import { useEffect, useState } from 'react';

export function ServiceGrid() {
  const [probes, setProbes] = useState<ServiceProbe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/demo/status', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? res.statusText);
        if (alive) {
          setProbes(appEndpoints.demoStatus.response.parse(json).probes);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed');
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <p className="text-sm text-negative">{error}</p>;
  if (!probes) return <p className="text-sm text-muted">Checking services…</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {probes.map((p) => (
        <Surface key={p.service} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm">{p.service}</span>
            <StatusPill ok={p.status?.ok ?? false} label={p.status?.ok ? 'up' : 'down'} />
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-xs text-muted">
            <dt>URL</dt>
            <dd className="truncate font-mono">{p.url.replace('/status', '')}</dd>
            <dt>Database</dt>
            <dd>{p.status?.db ?? '—'}</dd>
            <dt>Sim date</dt>
            <dd className="tabular">{p.status?.simDate ?? '—'}</dd>
            <dt>Latency</dt>
            <dd className="tabular">{p.latencyMs === null ? '—' : `${p.latencyMs} ms`}</dd>
          </dl>
          {p.error ? <p className="text-xs text-negative">{p.error}</p> : null}
        </Surface>
      ))}
    </div>
  );
}
