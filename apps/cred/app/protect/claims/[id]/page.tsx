'use client';

import { credApi } from '@cred/types';
import { Badge, Card, ErrorState, Icon, LoadingScreen, Money } from '@cred/ui';
import { useParams } from 'next/navigation';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';
import { CLAIM_STATUS } from '../../../_components/claim-status';
import { Screen } from '../../../_shell/Screen';

/** One claim: what happens next, and every update the insurer sent. Refreshes live. */
export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(credApi.products.claim, { params: { claimId: id } });
  const c = q.data?.claim;
  return (
    <Screen title="Claim" back="/protect/claims">
      {q.error && !c ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !c ? (
        <LoadingScreen label="Loading claim" />
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <Money paise={c.amountPaise} size="title" />
              <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].text}</Badge>
            </div>
            <p className="text-callout">{c.description}</p>
            <p className="text-caption text-muted">
              {c.policyName} · {c.insurerName}
            </p>
          </Card>
          <Card className="flex items-start gap-3">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-callout">{c.nextStep}</p>
          </Card>
          <ol className="flex flex-col" aria-label="Updates">
            {[...c.timeline].reverse().map((t, i) => (
              <li key={t.at + t.status} className="flex gap-3">
                <span className="flex flex-col items-center">
                  <span className={`mt-1.5 h-3 w-3 rounded-full ${i === 0 ? 'bg-accent' : 'bg-border'}`} />
                  {i < c.timeline.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                </span>
                <span className="pb-5">
                  <span className="block text-body">{CLAIM_STATUS[t.status].text}</span>
                  <span className="block text-callout text-muted">{t.note}</span>
                  <span className="block text-caption text-muted">{dateTime(t.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Screen>
  );
}
