'use client';

import { credApi, formatBps, type Loan } from '@cred/types';
import { Money, Surface } from '@cred/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';

export default function LoanPage() {
  const { id } = useParams<{ id: string }>();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api(credApi.products.loan, { params: { loanId: id } }).then((r) => setLoan(r.loan), (e) => setError(errorText(e)));
  }, [id]);

  if (error) return <p className="p-6 text-negative">{error}</p>;
  if (!loan) return <p className="p-6 text-muted">Loading…</p>;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <a href="/" className="text-sm text-muted">← Home</a>
      <h1 className="text-2xl font-semibold">Your EMI with {loan.lenderName}</h1>
      <Surface className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-muted">Amount</span><Money paise={loan.principalPaise} className="text-right" />
        <span className="text-muted">Rate</span><span className="text-right">{formatBps(loan.ratePaBps)} a year</span>
        <span className="text-muted">Monthly EMI</span><Money paise={loan.emiPaise} className="text-right font-semibold" />
        <span className="text-muted">Status</span><span className="text-right">{loan.status}</span>
      </Surface>
      <table className="w-full text-sm tabular">
        <thead className="text-left text-muted">
          <tr><th className="py-2">#</th><th>Due</th><th className="text-right">EMI</th><th className="text-right">Principal</th><th className="text-right">Interest</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loan.schedule.map((i) => (
            <tr key={i.n}>
              <td className="py-2">{i.n}</td>
              <td>{i.dueDate}</td>
              <td className="text-right"><Money paise={i.amountPaise} /></td>
              <td className="text-right"><Money paise={i.principalPaise} /></td>
              <td className="text-right"><Money paise={i.interestPaise} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {loan.schedule.length === 0 ? <p className="text-sm text-muted">The schedule appears once {loan.lenderName} disburses.</p> : null}
    </main>
  );
}
