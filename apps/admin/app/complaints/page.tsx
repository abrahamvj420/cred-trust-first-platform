'use client';

import { credApi } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useState } from 'react';
import { credAdmin } from '@/lib/api';
import { Page, Tag, time, useAdmin } from '../_ui';

/** Member complaints: read, resolve with a note back to the member. Every resolution is logged. */
export default function Complaints() {
  const q = useAdmin(() => credAdmin(credApi.admin.complaints, { query: { limit: 100 } }));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    setError(null);
    try {
      await credAdmin(credApi.admin.resolveComplaint, { params: { complaintId: id }, body: { resolution: notes[id]!.trim() } });
      await q.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setBusy(null);
  }

  const list = q.data?.complaints ?? [];
  return (
    <Page title="Complaints" subtitle={`${list.filter((c) => c.status === 'open').length} open · ${list.length} in all`} live={q.live}>
      {q.error || error ? <p className="text-sm text-negative">{q.error ?? error}</p> : null}
      {list.length === 0 && q.data ? <p className="text-sm text-muted">No complaints. Members raise them from Profile → Help and complaints.</p> : null}
      <div className="flex flex-col gap-3">
        {list.map((c) => (
          <Surface key={c.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-xs text-muted">{time(c.createdAt)}</span>
              <a className="font-semibold text-accent hover:underline" href={`/members?id=${c.memberId}`}>
                {c.memberName}
              </a>
              <Tag>{c.category.replace('_', ' ')}</Tag>
              <Tag tone={c.status === 'open' ? 'warning' : 'positive'}>{c.status}</Tag>
            </div>
            <p className="text-sm">{c.message}</p>
            {c.status === 'resolved' ? (
              <p className="rounded-md bg-raised p-3 text-sm text-muted">Reply: {c.resolution}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor={`r-${c.id}`} className="text-xs text-muted">
                  Reply to the member
                </label>
                <textarea id={`r-${c.id}`} rows={2} className="rounded-md border border-border bg-raised p-2 text-sm" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
                <Button size="sm" className="self-start" disabled={(notes[c.id] ?? '').trim().length < 5} loading={busy === c.id} onClick={() => resolve(c.id)}>
                  Resolve
                </Button>
              </div>
            )}
          </Surface>
        ))}
      </div>
    </Page>
  );
}
