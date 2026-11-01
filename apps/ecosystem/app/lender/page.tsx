'use client';

import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { day, Panel, Portal, State, usePortal } from '../_portal';

const KIND: Record<string, string> = { purchase_emi: 'EMI on card purchase', personal_loan: 'Personal loan', loan_against_funds: 'Loan against holdings', balance_switch_emi: 'Card balance switch', repayment_plan: 'Repayment plan' };

function Lender() {
  const q = usePortal((c) => ecosystem(ecosystemApi.lender.customerLoans, { params: { customerRef: c } }));
  const d = q.data;
  return (
    <Portal brand="Northstar Finance" tagline="Partner lenders · my loans" path="/lender">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <h1 className="text-2xl font-semibold">{d.customerName}</h1>
          {!d.loans.length ? <p className="text-muted">No loans with Northstar, Banyan or Keystone.</p> : null}
          {d.loans.map((l) => {
            const paid = l.schedule.filter((i) => i.status === 'paid').length;
            const overdue = l.schedule.filter((i) => i.status === 'overdue').length;
            return (
              <Panel key={l.loanRef} title={`${l.lenderName} · ${KIND[l.kind]}`} action={<span className={`text-sm font-semibold ${l.status === 'closed' ? 'text-muted' : overdue ? 'text-warning' : 'text-positive'}`}>{l.status === 'closed' ? 'closed' : overdue ? `${overdue} overdue` : 'active'}</span>}>
                <p className="text-sm">
                  <Money paise={l.principalPaise} /> at {(l.ratePaBps / 100).toFixed(2)}% · {paid} of {l.schedule.length} EMIs paid{l.disbursedAt ? ` · disbursed ${day(l.disbursedAt)}` : ''}
                </p>
                {l.collateral ? <p className="text-sm text-muted">Security: {l.collateral}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {l.schedule.map((i) => (
                    <span
                      key={i.n}
                      title={`EMI ${i.n} · ${i.dueDate} · ${i.status}`}
                      className={`h-3 w-6 rounded-sm ${i.status === 'paid' ? 'bg-positive' : i.status === 'overdue' ? 'bg-warning' : 'bg-border'}`}
                    />
                  ))}
                </div>
              </Panel>
            );
          })}
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Lender />
    </Suspense>
  );
}
