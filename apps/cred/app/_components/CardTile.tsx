import type { Card } from '@cred/types';
import { Money, ProgressBar } from '@cred/ui';
import { pct } from '@/lib/format';

/** The card as an object: issuer, network, last four, balance and utilisation. No logos. */
export function CardTile({ card, href, compact = false }: { card: Card; href?: string; compact?: boolean }) {
  const body = (
    <div className={`relative flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-gradient-to-br from-raised via-surface to-bg p-card shadow-e2 transition-calm ${compact ? 'min-h-36' : 'min-h-48'} ${href ? 'hover:border-muted active:scale-[0.99]' : ''}`}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border border-border/70" />
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full border border-border/50" />
      <div className="relative flex items-start justify-between">
        <span className="text-callout font-semibold">{card.issuerName}</span>
        <span className="text-overline uppercase text-muted">{card.network}</span>
      </div>
      <div className="relative flex flex-col gap-3">
        <span className="tabular text-callout tracking-[0.2em] text-muted">•••• {card.last4}</span>
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="block text-caption text-muted">Outstanding</span>
            <Money paise={card.outstandingPaise} size="title" />
          </div>
          <div className="text-right">
            <span className="block text-caption text-muted">{pct(card.utilisationBps)} of limit</span>
            <Money paise={card.limitPaise} className="text-caption text-muted" />
          </div>
        </div>
        <ProgressBar value={card.utilisationBps / 10_000} label={`${pct(card.utilisationBps)} of your card limit used`} />
      </div>
    </div>
  );
  return href ? (
    <a href={href} aria-label={`${card.issuerName} ${card.network} card ending ${card.last4}`} className="block rounded-lg">
      {body}
    </a>
  ) : (
    body
  );
}
