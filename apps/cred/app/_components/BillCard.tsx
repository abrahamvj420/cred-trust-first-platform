import type { Card } from '@cred/types';
import { Badge, ButtonLink, Card as Panel, Icon, Money } from '@cred/ui';
import { dueLabel } from '@/lib/format';

/** One card's bill: what's due, when, and one tap to pay. Bill pay is never blocked by offers. */
export function BillCard({ card, today }: { card: Card; today: string }) {
  const due = card.nextDue;
  if (!due) return null;
  const label = dueLabel(today, due.dueDate);
  const paid = due.remainingPaise === 0;
  return (
    <Panel elevation={2} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-callout text-muted">
          {card.issuerName} ···· {card.last4}
        </span>
        {paid ? <Badge tone="positive">Paid</Badge> : due.status === 'partial' ? <Badge tone="warning">Part paid</Badge> : <Badge tone={label.tone === 'neutral' ? 'neutral' : label.tone}>{label.badge}</Badge>}
      </div>
      {paid ? (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-positive/15 text-positive">
            <Icon name="check" />
          </span>
          <div>
            <p className="text-headline">All paid for this cycle</p>
            <p className="text-caption text-muted">
              <Money paise={due.totalDuePaise} /> settled. Thank you for paying on time.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className="text-caption text-muted">{due.status === 'partial' ? 'Left to pay' : 'Total due'}</p>
            <Money paise={due.remainingPaise} size="display" />
            <p className="mt-1 text-caption text-muted">
              {label.date}
              {due.status === 'partial' ? (
                <>
                  {' '}· <Money paise={due.paidPaise} /> paid so far
                </>
              ) : null}
            </p>
          </div>
          <ButtonLink href={`/pay/${card.id}`} block>
            Pay <Money paise={due.remainingPaise} />
          </ButtonLink>
        </>
      )}
    </Panel>
  );
}
