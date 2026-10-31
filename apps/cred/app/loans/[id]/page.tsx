'use client';

import { credApi, formatBps } from '@cred/types';
import { Badge, Card, EmptyState, ErrorState, LoadingScreen, Money, SectionHeader } from '@cred/ui';
import { useParams } from 'next/navigation';
import { longDate, shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

const KIND: Record<string, string> = {
  purchase_emi: 'EMI on a card purchase',
  personal_loan: 'Personal loan',
  loan_against_funds: 'Loan against your holdings',
  balance_switch_emi: 'Card balance moved to an EMI',
};

export default function LoanPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(credApi.products.loan, { params: { loanId: id } });
  const l = q.data?.loan;
  const offer = useApi(credApi.products.offer, { params: { offerId: l?.offerId ?? '' } }, { enabled: !!l?.offerId, live: false });
  const terms = offer.data?.offer.options.find((o) => o.acceptable && o.terms?.kind === 'loan' && o.terms.lenderName === l?.lenderName)?.terms;
  const steps = terms?.kind === 'loan' ? (terms.rateStepDown ?? []) : [];
  const paid = l?.schedule.filter((i) => i.status === 'paid').length ?? 0;
  const next = l?.schedule.find((i) => i.status !== 'paid');
  return (
    <Screen title="EMI schedule" back="/loans">
      {q.error && !l ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !l ? (
        <LoadingScreen label="Loading loan" />
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <p className="text-callout text-muted">
                {l.lenderName} · {KIND[l.kind]}
              </p>
              <Badge tone={l.status === 'disbursed' ? 'positive' : 'neutral'}>{l.status === 'disbursed' ? 'Active' : l.status}</Badge>
            </div>
            <div>
              <p className="text-caption text-muted">Monthly EMI</p>
              <Money paise={l.emiPaise} size="display" />
              {next ? <p className="text-caption text-muted">Next due {longDate(next.dueDate)}</p> : null}
            </div>
            <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-caption">
              <div>
                <dt className="text-muted">Amount</dt>
                <dd className="text-headline"><Money paise={l.principalPaise} /></dd>
              </div>
              <div>
                <dt className="text-muted">Rate</dt>
                <dd className="text-headline">{formatBps(l.ratePaBps)}</dd>
              </div>
              <div>
                <dt className="text-muted">Tenure</dt>
                <dd className="text-headline">{l.tenureMonths} mo</dd>
              </div>
            </dl>
          </Card>
          {steps.length ? (
            <Card className="flex flex-col gap-2">
              <p className="text-headline">Your rate steps down when you pay on time</p>
              {steps.map((st) => (
                <p key={st.afterOnTimePayments} className="flex items-center justify-between text-callout">
                  <span className="text-muted">After {st.afterOnTimePayments} on-time EMIs</span>
                  <span className={`tabular ${paid >= st.afterOnTimePayments ? 'text-positive' : ''}`}>
                    {formatBps(st.ratePaBps)} {paid >= st.afterOnTimePayments ? '· reached' : ''}
                  </span>
                </p>
              ))}
            </Card>
          ) : null}
          <section className="flex flex-col gap-3">
            <SectionHeader title={`Instalments · ${paid} of ${l.tenureMonths} paid`} />
            {l.schedule.length === 0 ? (
              <EmptyState icon="list" title="Schedule on its way" body={`It appears once ${l.lenderName} disburses.`} />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-e1">
                <table className="w-full text-callout">
                  <caption className="sr-only">EMI schedule</caption>
                  <thead className="text-caption text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-normal">Due</th>
                      <th scope="col" className="py-3 text-right font-normal">Principal</th>
                      <th scope="col" className="py-3 text-right font-normal">Interest</th>
                      <th scope="col" className="px-4 py-3 text-right font-normal">EMI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {l.schedule.map((i) => (
                      <tr key={i.n} className={i === next ? 'bg-raised' : ''}>
                        <td className="px-4 py-3">
                          {shortDate(i.dueDate)}
                          {i === next ? <span className="block text-caption text-accent">Next</span> : i.status === 'paid' ? <span className="block text-caption text-positive">Paid</span> : null}
                        </td>
                        <td className="py-3 text-right"><Money paise={i.principalPaise} /></td>
                        <td className="py-3 text-right text-muted"><Money paise={i.interestPaise} /></td>
                        <td className="px-4 py-3 text-right font-semibold"><Money paise={i.amountPaise} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Screen>
  );
}
