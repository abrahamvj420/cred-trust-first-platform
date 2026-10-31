import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** Placeholder blocks that match the shape of what's loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-raised ${className}`} />;
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon = 'spark', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-muted">
        <Icon name={icon} />
      </span>
      <p className="text-headline">{title}</p>
      {body ? <p className="max-w-[28ch] text-callout text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-warning">
        <Icon name="alert" />
      </span>
      <p className="text-headline">Something didn’t load</p>
      <p className="max-w-[32ch] text-callout text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Inline notice for form-level problems (e.g. a bank refusing a payment). */
export function Notice({ tone = 'warning', children }: { tone?: 'warning' | 'info' | 'positive'; children: ReactNode }) {
  const color = tone === 'warning' ? 'text-warning' : tone === 'positive' ? 'text-positive' : 'text-muted';
  return (
    <div role={tone === 'warning' ? 'alert' : 'status'} className="flex gap-3 rounded-md border border-border bg-raised p-4 text-callout">
      <Icon name={tone === 'positive' ? 'check' : tone === 'warning' ? 'alert' : 'info'} className={`mt-0.5 shrink-0 ${color}`} size={18} />
      <div>{children}</div>
    </div>
  );
}
