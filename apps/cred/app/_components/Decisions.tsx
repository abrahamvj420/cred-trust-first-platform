'use client';

import { credApi, type MemberDecision } from '@cred/types';
import { Surface } from '@cred/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const LABEL: Record<MemberDecision['outcome'], string> = { offer: 'Suggested', blocked: 'No suggestion', help: 'Help, not credit' };

/** Transparency: every decision CRED made about you, offer or not, and why. */
export function Decisions({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<MemberDecision[]>([]);
  useEffect(() => {
    api(credApi.products.decisions, { query: { limit: 5 } }).then((r) => setItems(r.decisions), () => undefined);
  }, [refreshKey]);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Why we did or didn’t suggest something</h2>
      {items.map((d) => (
        <Surface key={d.id} className="flex flex-col gap-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {LABEL[d.outcome]}
            {d.origin === 'member_initiated' ? ' · you asked' : ''} · {new Date(d.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm">{d.explanation}</p>
        </Surface>
      ))}
    </section>
  );
}
