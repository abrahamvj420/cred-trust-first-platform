'use client';

import { credApi } from '@cred/types';
import { Avatar, Badge, EmptyState, ErrorState, List, ListRow, LoadingScreen, Money } from '@cred/ui';
import { shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

export default function Loans() {
  const q = useApi(credApi.products.loans);
  return (
    <Screen title="Your loans" back="/profile">
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading loans" />
      ) : q.data.loans.length === 0 ? (
        <EmptyState icon="loan" title="No loans" body="EMIs you take through CRED show up here, with every instalment." />
      ) : (
        <List>
          {q.data.loans.map((l) => {
            const paid = l.schedule.filter((i) => i.status === 'paid').length;
            const next = l.schedule.find((i) => i.status !== 'paid');
            return (
              <ListRow
                key={l.id}
                href={`/loans/${l.id}`}
                leading={<Avatar icon="loan" />}
                title={
                  <>
                    {l.lenderName} <Money paise={l.principalPaise} className="text-muted" />
                  </>
                }
                subtitle={l.status === 'disbursed' ? (next ? `Next EMI ${shortDate(next.dueDate)} · ${paid} of ${l.tenureMonths} paid` : 'All EMIs paid') : `Status: ${l.status}`}
                trailing={l.status === 'disbursed' ? <Money paise={l.emiPaise} className="font-semibold" /> : <Badge tone={l.status === 'declined' ? 'negative' : 'neutral'}>{l.status}</Badge>}
              />
            );
          })}
        </List>
      )}
    </Screen>
  );
}
