'use client';

import { credApi } from '@cred/types';
import { credAdmin } from '@/lib/api';
import { DataTable, Page, Section, Tag, time, useAdmin } from '../_ui';

/** Partners: calls CRED made out, and signed webhooks that came in (signature checks, duplicates ignored). */
export default function Partners() {
  const q = useAdmin(async () => ({
    calls: (await credAdmin(credApi.admin.partnerCalls, { query: { limit: 100 } })).calls,
    hooks: (await credAdmin(credApi.admin.webhooks, { query: { limit: 150 } })).webhooks,
  }));
  return (
    <Page title="Partners & webhooks" subtitle="CRED talks to partners only through contracts: REST calls out, signed webhooks in" live={q.live}>
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      <div className="grid gap-6 2xl:grid-cols-2">
        <Section title="Calls to partners">
          <DataTable
            head={['When', 'Partner', 'Call', 'Status', 'Time']}
            align={['left', 'left', 'left', 'left', 'right']}
            rows={(q.data?.calls ?? []).map((c) => [
              time(c.at),
              <Tag key="p">{c.partner}</Tag>,
              <span key="c" className="font-mono text-xs">{`${c.method} ${c.path}`}</span>,
              <Tag key="s" tone={c.status < 300 ? 'positive' : c.status < 500 ? 'warning' : 'negative'}>{String(c.status)}</Tag>,
              `${c.ms} ms`,
            ])}
          />
        </Section>
        <Section title="Webhooks received">
          <DataTable
            head={['Received', 'Partner', 'Event', 'Signature', 'Duplicate']}
            rows={(q.data?.hooks ?? []).map((w) => [
              time(w.receivedAt),
              <Tag key="p">{w.partner}</Tag>,
              <span key="t" className="font-mono text-xs">{w.type}</span>,
              w.signatureOk ? <Tag tone="positive">valid</Tag> : <Tag tone="negative">rejected</Tag>,
              w.duplicate ? <Tag tone="warning">ignored</Tag> : '—',
            ])}
          />
        </Section>
      </div>
    </Page>
  );
}
