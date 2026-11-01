'use client';

import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { day, Panel, Portal, State, usePortal } from '../_portal';

function Upi() {
  const q = usePortal((c) => ecosystem(ecosystemApi.upi.customerPayments, { params: { customerRef: c } }));
  const d = q.data;
  return (
    <Portal brand="UPI" tagline="Your UPI IDs and payments" path="/upi">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <Panel title={d.customerName}>
            <p className="text-sm">
              UPI ID{d.vpas.length > 1 ? 's' : ''}: <span className="font-semibold">{d.vpas.join(', ')}</span>
            </p>
            <p className="text-xs text-muted">Every payment, from any app, is approved here with your UPI PIN. Apps never see the PIN.</p>
          </Panel>
          <Panel title="Payments">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {d.payments.map((p) => (
                  <tr key={p.ref}>
                    <td className="py-2 text-muted">{day(p.at)}</td>
                    <td className="py-2">
                      {p.direction === 'sent' ? 'To' : 'From'} {p.counterparty}
                      <span className="block text-xs text-muted">
                        via {p.via}
                        {p.rrn ? ` · RRN ${p.rrn}` : ''}
                      </span>
                    </td>
                    <td className={`py-2 text-xs ${p.status === 'success' ? 'text-positive' : 'text-negative'}`}>{p.status}</td>
                    <td className={`py-2 text-right tabular ${p.direction === 'received' ? 'text-positive' : ''}`}>
                      <Money paise={p.direction === 'sent' ? -p.amountPaise : p.amountPaise} sign />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.payments.length ? <p className="text-sm text-muted">No UPI payments yet.</p> : null}
          </Panel>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Upi />
    </Suspense>
  );
}
