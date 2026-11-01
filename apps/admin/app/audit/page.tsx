'use client';

import { credApi } from '@cred/types';
import { credAdmin } from '@/lib/api';
import { DataTable, Page, Section, Tag, time, useAdmin } from '../_ui';

const details = (d: Record<string, unknown>) => {
  const s = Object.entries(d)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
};

/** Permission log (grants, withdrawals, AA consents, prompts) and the full audit log, including privacy actions. */
export default function Audit() {
  const q = useAdmin(async () => ({
    perms: (await credAdmin(credApi.admin.permissionLog, { query: { limit: 100 } })).entries,
    audit: (await credAdmin(credApi.admin.audit, { query: { limit: 200 } })).entries,
    members: (await credAdmin(credApi.admin.members)).members,
  }));
  const name = (id: string | null) => (id ? (q.data?.members.find((m) => m.id === id)?.name ?? 'Deleted member') : 'system');
  const tone = (a: string) => (a.startsWith('privacy.') ? 'accent' : a.includes('withdrawn') || a.includes('revoked') ? 'warning' : a.startsWith('rule.') ? 'accent' : 'muted');
  return (
    <Page title="Permissions & audit" subtitle="Every grant, withdrawal and privacy action, and everything CRED did" live={q.live}>
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      <Section title="Permission log">
        <DataTable
          head={['When', 'Member', 'Actor', 'Action', 'Scope', 'Details']}
          rows={(q.data?.perms ?? []).map((e) => [time(e.at), name(e.memberId), e.actor, <Tag key="a" tone={tone(e.action)}>{e.action}</Tag>, e.target ?? '', <span key="d" className="text-xs text-muted">{details(e.details)}</span>])}
        />
      </Section>
      <Section title="Audit log">
        <DataTable
          head={['When', 'Member', 'Actor', 'Action', 'Target', 'Details']}
          rows={(q.data?.audit ?? []).map((e) => [time(e.at), name(e.memberId), e.actor, <Tag key="a" tone={tone(e.action)}>{e.action}</Tag>, <span key="t" className="font-mono text-xs">{e.target ?? ''}</span>, <span key="d" className="text-xs text-muted">{details(e.details)}</span>])}
        />
      </Section>
    </Page>
  );
}
