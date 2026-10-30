import { formatInr, formatInrExact } from '@cred/types';

/** All money on screen goes through here: ₹ with Indian grouping. */
export function Money({ paise, exact = false, className = '' }: { paise: number; exact?: boolean; className?: string }) {
  return <span className={`tabular ${className}`}>{exact ? formatInrExact(paise) : formatInr(paise)}</span>;
}
