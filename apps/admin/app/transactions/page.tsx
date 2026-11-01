'use client';

import { credApi } from '@cred/types';
import { Money } from '@cred/ui';
import { credAdmin } from '@/lib/api';
import { DataTable, Page, time, useAdmin } from '../_ui';

export default function Transactions() {
  const q = useAdmin(() => credAdmin(credApi.admin.transactions, { query: { limit: 200 } }));
  return (
    <Page title="Transactions" subtitle="Card transactions CRED received from Mock Bank, by signed webhook" live={q.live}>
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      <DataTable
        head={['Posted', 'Member', 'Merchant', 'Category', 'Amount']}
        align={['left', 'left', 'left', 'left', 'right']}
        rows={(q.data?.transactions ?? []).map((t) => [
          time(t.postedAt),
          <a key="m" className="text-accent hover:underline" href={`/members?id=${t.memberId}`}>
            {t.memberName}
          </a>,
          t.merchant,
          t.category,
          <Money key="a" paise={t.amountPaise} />,
        ])}
      />
    </Page>
  );
}
