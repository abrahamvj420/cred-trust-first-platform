import type { HTMLAttributes } from 'react';

type Elevation = 1 | 2;

/** A card: surface colour, hairline border, resting or raised elevation. */
export function Card({ elevation = 1, interactive = false, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { elevation?: Elevation; interactive?: boolean }) {
  return (
    <div
      {...props}
      className={`rounded-lg border border-border bg-surface p-card ${elevation === 2 ? 'shadow-e2' : 'shadow-e1'} ${interactive ? 'transition-calm hover:border-muted active:scale-[0.99]' : ''} ${className}`}
    />
  );
}

/** Back-compat name used by the other apps. */
export const Surface = Card;
