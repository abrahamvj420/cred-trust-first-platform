'use client';

import { ecosystemApi } from '@cred/types';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { day, Panel, Portal, State, usePortal } from '../_portal';

const FI: Record<string, string> = { DEPOSIT: 'Bank transactions', TERM_DEPOSIT: 'Fixed deposits', MUTUAL_FUNDS: 'Mutual funds', INSURANCE_POLICIES: 'Insurance policies' };
const TONE: Record<string, string> = { ACTIVE: 'text-positive', PENDING: 'text-warning', REJECTED: 'text-muted', REVOKED: 'text-muted', EXPIRED: 'text-muted' };

function Aa() {
  const q = usePortal((c) => ecosystem(ecosystemApi.aa.customerConsents, { params: { customerRef: c } }));
  const d = q.data;
  return (
    <Portal brand="SimAA" tagline="Account Aggregator · your consents" path="/aa">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <Panel title={`${d.customerName} · ${d.handle}`}>
            <p className="text-sm text-muted">SimAA moves your financial data only with your consent, only to the app you choose, and only for as long as you allow. It can’t read it.</p>
          </Panel>
          <Panel title="Consents">
            {d.consents.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {d.consents.map((c) => (
                  <li key={c.consentHandle} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{c.fiuName}</p>
                      <p className="text-sm text-muted">{c.purposeText}</p>
                      <p className="text-xs text-muted">
                        {c.fiTypes.map((f) => FI[f] ?? f).join(', ')} · requested {day(c.createdAt)}
                        {c.decidedAt ? ` · decided ${day(c.decidedAt)}` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${TONE[c.status]}`}>{c.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No consents yet.</p>
            )}
          </Panel>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Aa />
    </Suspense>
  );
}
