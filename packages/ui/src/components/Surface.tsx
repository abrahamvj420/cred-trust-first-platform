import type { HTMLAttributes } from 'react';

export function Surface({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-lg border border-border bg-surface p-5 ${className}`} />;
}
