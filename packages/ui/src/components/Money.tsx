import { formatInr, formatInrExact } from '@cred/types';

const sizes = { display: 'text-display', title: 'text-title', headline: 'text-headline', body: '', caption: 'text-caption' } as const;

/** All money on screen goes through here: ₹ with Indian grouping, tabular figures. */
export function Money({ paise, exact = false, size = 'body', sign = false, className = '' }: { paise: number; exact?: boolean; size?: keyof typeof sizes; sign?: boolean; className?: string }) {
  const text = exact ? formatInrExact(Math.abs(paise)) : formatInr(Math.abs(paise));
  const prefix = paise < 0 ? '−' : sign && paise > 0 ? '+' : '';
  return <span className={`tabular ${sizes[size]} ${className}`}>{prefix}{text}</span>;
}
