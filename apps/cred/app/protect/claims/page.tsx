'use client';

import { credApi } from '@cred/types';
import { CLAIM_STATUS } from '../../_components/claim-status';
import { Avatar, Badge, ButtonLink, EmptyState, ErrorState, List, ListRow, LoadingScreen, Money } from '@cred/ui';
import { shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

/** Claims Concierge: CRED files with the insurer and follows each update for you. */
export default function Claims() {
  const q = useApi(credApi.products.claims);
  return (
    <Screen title="Claims" back="/protect" footer={<ButtonLink href="/protect/claims/new" block>File a claim</ButtonLink>}>
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading claims" />
      ) : !q.data.claims.length ? (
        <EmptyState icon="doc" title="No claims" body="If you need to claim, we file it with your insurer and tell you every step." />
      ) : (
        <List>
          {q.data.claims.map((c) => (
            <ListRow
              key={c.id}
              href={`/protect/claims/${c.id}`}
              leading={<Avatar icon="doc" />}
              title={
                <>
                  <Money paise={c.amountPaise} /> · {c.policyName}
                </>
              }
              subtitle={`Filed ${shortDate(c.createdAt.slice(0, 10))} · ${c.description}`}
              trailing={<Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].text}</Badge>}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
