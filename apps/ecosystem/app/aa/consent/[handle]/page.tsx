'use client';

import { ApiError, ecosystemApi, type EndpointResponse } from '@cred/types';
import { Button, Notice } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ecosystem } from '@/lib/api';

type Detail = EndpointResponse<typeof ecosystemApi.aa.consent>;

const FI_LABEL: Record<string, string> = {
  DEPOSIT: 'Bank account transactions',
  TERM_DEPOSIT: 'Fixed deposits',
  MUTUAL_FUNDS: 'Mutual fund holdings',
  INSURANCE_POLICIES: 'Insurance policies',
};

/** SimAA's own consent page: the customer sees exactly what is asked, by whom and for how long, and chooses the accounts. */
export default function Consent() {
  const { handle } = useParams<{ handle: string }>();
  const [c, setC] = useState<Detail | null>(null);
  const [picked, setPicked] = useState<string[]>([]); // nothing pre-selected
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ecosystem(ecosystemApi.aa.consent, { params: { consentHandle: handle } }).then(setC, (e) => setError(e instanceof ApiError ? e.message : 'Could not load this request'));
  }, [handle]);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setError(null);
    try {
      const r = await ecosystem(ecosystemApi.aa.decide, { params: { consentHandle: handle }, body: { decision, accountRefs: decision === 'approve' ? picked : [] } });
      window.location.href = r.redirectUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setBusy(null);
    }
  }

  const toggle = (ref: string) => setPicked((p) => (p.includes(ref) ? p.filter((x) => x !== ref) : [...p, ref]));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-headline font-bold text-accent">SimAA</span>
        <span className="text-caption text-muted">Account Aggregator</span>
      </header>
      {c ? (
        <>
          <section className="flex flex-col gap-2">
            <p className="text-caption text-muted">Hello {c.customerName.split(' ')[0]}</p>
            <h1 className="text-title">{c.fiuName} is asking to see some of your financial information</h1>
            <p className="text-callout text-muted">{c.purposeText}.</p>
          </section>
          {c.status !== 'PENDING' ? (
            <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5">
              <p className="text-headline">This request is {c.status === 'ACTIVE' ? 'approved' : c.status.toLowerCase()}.</p>
              <a href={c.redirectUrl} className="text-callout text-accent underline">
                Back to {c.fiuName}
              </a>
            </section>
          ) : (
            <>
              <dl className="divide-y divide-border rounded-md border border-border bg-surface text-callout">
                {[
                  ['What', c.fiTypes.map((f) => FI_LABEL[f] ?? f).join(', ')],
                  ['How far back', `${c.dataRangeMonths} ${c.dataRangeMonths === 1 ? 'month' : 'months'}`],
                  ['For how long', c.validForMonths === 1 ? 'One month, read once' : `${c.validForMonths} months, updated when it changes`],
                  ['Shared with', c.fiuName],
                ].map(([k, v]) => (
                  <div key={k} className="flex min-h-12 items-start justify-between gap-4 px-4 py-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-callout font-semibold">Choose what to share</legend>
                {c.accounts.length ? (
                  c.accounts.map((a) => (
                    <label key={a.accountRef} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 ${picked.includes(a.accountRef) ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
                      <input type="checkbox" checked={picked.includes(a.accountRef)} onChange={() => toggle(a.accountRef)} className="h-5 w-5 shrink-0 accent-current text-accent" />
                      <span className="flex-1">
                        <span className="block text-body">{a.label}</span>
                        <span className="block text-caption text-muted">
                          {a.fipName} · {a.masked}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-callout text-muted">We couldn’t find any accounts of this type in your name.</p>
                )}
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" loading={busy === 'reject'} disabled={!!busy} onClick={() => decide('reject')}>
                  Reject
                </Button>
                <Button loading={busy === 'approve'} disabled={!!busy || !picked.length} onClick={() => decide('approve')}>
                  Approve
                </Button>
              </div>
              <p className="text-caption text-muted">You can revoke this any time, here or in {c.fiuName}. SimAA never stores or reads your data; it passes it on, encrypted, only as you approve.</p>
            </>
          )}
          {error ? <Notice>{error}</Notice> : null}
        </>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : (
        <p className="text-muted">Loading…</p>
      )}
    </main>
  );
}
