'use client';

import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { day, Panel, Portal, State, usePortal } from '../_portal';

function Bank() {
  const q = usePortal((c) => ecosystem(ecosystemApi.bank.overview, { params: { customerRef: c } }));
  const d = q.data;
  return (
    <Portal brand="Mock Bank" tagline="Net banking" path="/bank">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <h1 className="text-2xl font-semibold">Welcome, {d.name.split(' ')[0]}</h1>
          <div className="grid gap-4 md:grid-cols-3">
            {d.accounts.map((a) => (
              <Panel key={a.accountRef} title={`${a.kind === 'salary' ? 'Salary' : 'Savings'} account ${a.accountMasked}`}>
                <Money paise={a.balancePaise} className="text-2xl font-semibold" />
                <span className="text-xs text-muted">Available balance</span>
              </Panel>
            ))}
            {d.card ? (
              <Panel title={`Credit card ···· ${d.card.last4}`}>
                <Money paise={d.card.outstandingPaise} className="text-2xl font-semibold" />
                <span className="text-xs text-muted">
                  Outstanding of <Money paise={d.card.limitPaise} /> limit
                </span>
              </Panel>
            ) : null}
            {d.fixedDeposits.map((f) => (
              <Panel key={f.fdRef} title="Fixed deposit">
                <Money paise={f.principalPaise} className="text-2xl font-semibold" />
                <span className="text-xs text-muted">
                  {(f.ratePaBps / 100).toFixed(2)}% · matures {day(f.maturesOn)}
                </span>
              </Panel>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Recent transactions">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {d.recentTransactions.map((t, i) => (
                    <tr key={i}>
                      <td className="py-2 text-muted">{day(t.at)}</td>
                      <td className="py-2">{t.narration}</td>
                      <td className={`py-2 text-right tabular ${t.amountPaise >= 0 ? 'text-positive' : ''}`}>
                        <Money paise={t.amountPaise} sign />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Card statements">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 font-normal">Statement</th>
                    <th className="py-1 font-normal">Due</th>
                    <th className="py-1 text-right font-normal">Total</th>
                    <th className="py-1 text-right font-normal">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.statements.map((s) => (
                    <tr key={s.statementRef}>
                      <td className="py-2">{day(s.periodEnd)}</td>
                      <td className="py-2 text-muted">{day(s.dueDate)}</td>
                      <td className="py-2 text-right tabular">
                        <Money paise={s.totalDuePaise} />
                      </td>
                      <td className={`py-2 text-right tabular ${s.paidPaise >= s.totalDuePaise ? 'text-positive' : 'text-warning'}`}>
                        <Money paise={s.paidPaise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Bank />
    </Suspense>
  );
}
