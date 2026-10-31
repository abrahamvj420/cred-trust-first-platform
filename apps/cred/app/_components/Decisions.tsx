'use client';

import { credApi, type MemberDecision } from '@cred/types';
import { Badge, Card, EmptyState, ErrorState, LoadingScreen } from '@cred/ui';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';

const LABEL: Record<MemberDecision['outcome'], { text: string; tone: 'accent' | 'neutral' | 'warning' }> = {
  offer: { text: 'Suggested', tone: 'accent' },
  blocked: { text: 'Nothing suggested', tone: 'neutral' },
  help: { text: 'Support offered', tone: 'warning' },
  available: { text: 'Now available', tone: 'accent' },
};

/** Transparency: every decision CRED made about you, offer or not, and why. */
export function Decisions({ limit = 50 }: { limit?: number }) {
  const q = useApi(credApi.products.decisions, { query: { limit } });
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingScreen label="Loading decisions" />;
  if (!q.data.decisions.length) return <EmptyState icon="list" title="Nothing yet" body="When CRED considers a suggestion for you, you’ll see it here, whether or not we showed one." />;
  return (
    <div className="flex flex-col gap-3">
      {q.data.decisions.map((d) => (
        <Card key={d.id} className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LABEL[d.outcome].tone}>{LABEL[d.outcome].text}</Badge>
            {d.origin === 'member_initiated' ? <Badge>You asked</Badge> : null}
            <span className="text-caption text-muted">{dateTime(d.createdAt)}</span>
          </div>
          <p className="text-callout">{d.explanation}</p>
        </Card>
      ))}
    </div>
  );
}
