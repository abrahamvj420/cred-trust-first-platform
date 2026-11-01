'use client';

import { credApi } from '@cred/types';
import { Money } from '@cred/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { credAdmin } from '@/lib/api';
import { DataTable, DecisionCard, Page, Section, Tag, time, useAdmin } from '../_ui';

/** Members, and one member's full picture: decisions, transactions, loans, permission and audit trail. */
function Members() {
  const id = useSearchParams().get('id');
  const list = useAdmin(() => credAdmin(credApi.admin.members));
  const detail = useAdmin(
    async () =>
      id
        ? {
            decisions: (await credAdmin(credApi.admin.decisions, { query: { memberId: id, limit: 20 } })).decisions,
            txns: (await credAdmin(credApi.admin.transactions, { query: { memberId: id, limit: 15 } })).transactions,
            loans: (await credAdmin(credApi.admin.loans, { query: { memberId: id } })).loans,
            audit: (await credAdmin(credApi.admin.audit, { query: { memberId: id, limit: 25 } })).entries,
          }
        : null,
    [id],
  );
  const member = list.data?.members.find((m) => m.id === id);
  return (
    <Page title={member ? member.name : 'Members'} subtitle={member ? `${member.city} · ${member.vpa}` : 'Every member, with what the engine sees'} live={list.live}>
      {list.error ? <p className="text-sm text-negative">{list.error}</p> : null}
      {!id ? (
        <DataTable
          head={['Member', 'City', 'Smart Savings', 'Signals', 'Offers this month', 'Active offer']}
          rows={(list.data?.members ?? []).map((m) => [
            <a key="n" className="text-accent hover:underline" href={`/members?id=${m.id}`}>
              {m.name}
            </a>,
            m.city,
            m.smartSavings ? <Tag tone="positive">on</Tag> : <Tag>off</Tag>,
            m.stressed ? <Tag tone="warning">strain: help, not credit</Tag> : <Tag>none</Tag>,
            m.offersThisMonth,
            m.activeOfferId ? <Tag tone="accent">yes</Tag> : '—',
          ])}
        />
      ) : detail.data ? (
        <>
          <a href="/members" className="text-xs text-accent">
            ← All members
          </a>
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Transactions">
              <DataTable head={['When', 'Merchant', 'Amount']} align={['left', 'left', 'right']} rows={detail.data.txns.map((t) => [time(t.postedAt), t.merchant, <Money key="m" paise={t.amountPaise} />])} />
            </Section>
            <Section title="Loans">
              <DataTable
                head={['Lender', 'Kind', 'Status', 'Principal']}
                align={['left', 'left', 'left', 'right']}
                rows={detail.data.loans.map((l) => [l.lenderName, l.kind.replaceAll('_', ' '), l.status, <Money key="m" paise={l.principalPaise} />])}
                empty="No loans"
              />
            </Section>
          </div>
          <Section title="Decisions">
            <div className="flex flex-col gap-2">
              {detail.data.decisions.map((d) => (
                <DecisionCard key={d.id} d={d} />
              ))}
            </div>
          </Section>
          <Section title="Audit trail">
            <DataTable
              head={['When', 'Actor', 'Action', 'Target']}
              rows={detail.data.audit.map((e) => [time(e.at), e.actor, <span key="a" className="font-mono text-xs">{e.action}</span>, e.target ?? ''])}
            />
          </Section>
        </>
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </Page>
  );
}

export default function Page_() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}
