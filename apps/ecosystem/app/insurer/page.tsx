'use client';

import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { day, Panel, Portal, State, usePortal } from '../_portal';

const lakh = (p: number) => `₹${Number((p / 1_00_000_00).toFixed(1))} lakh`;

function Insurer() {
  const q = usePortal((c) => ecosystem(ecosystemApi.insurer.customerPolicies, { params: { customerRef: c } }));
  const d = q.data;
  return (
    <Portal brand="Sahaj Health Insurance" tagline="My policies" path="/insurer">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <h1 className="text-2xl font-semibold">Hello {d.customerName.split(' ')[0]}</h1>
          {d.policies.length ? null : <p className="text-muted">No policies with us.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {d.policies.map((p) => (
              <Panel key={p.policyRef} title={p.productName} action={p.isEmployer ? <span className="text-xs text-muted">via {p.employerName}</span> : null}>
                <p className="text-2xl font-semibold">{p.kind.startsWith('motor') ? <Money paise={p.coverPaise} /> : lakh(p.coverPaise)}</p>
                <p className="text-sm text-muted">
                  {p.kind === 'motor_third_party' ? 'Third-party liability limit' : 'Sum insured'}
                  {p.membersCovered.length ? ` · covers ${p.membersCovered.join(', ')}` : ''}
                </p>
                <p className="text-sm">
                  Premium <Money paise={p.annualPremiumPaise} /> a year{p.renewalDate ? ` · renews ${day(p.renewalDate)}` : ''}
                </p>
                {p.claims.length ? (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                    {p.claims.map((c) => (
                      <li key={c.claimRef} className="flex justify-between gap-3">
                        <span>
                          Claim <Money paise={c.amountPaise} /> · filed {day(c.filedAt)}
                        </span>
                        <span className={c.status === 'settled' ? 'text-positive' : 'text-accent'}>{c.status.replace('_', ' ')}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            ))}
          </div>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Insurer />
    </Suspense>
  );
}
