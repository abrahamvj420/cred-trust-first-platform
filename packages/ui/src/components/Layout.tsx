import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between">
      <h2 className="text-overline uppercase text-muted">{title}</h2>
      {action}
    </div>
  );
}

/** A tappable row: at least 56px tall, with optional leading visual and trailing value. */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron = !!href,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{title}</span>
        {subtitle ? <span className="block truncate text-caption text-muted">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-right">{trailing}</span> : null}
      {chevron ? <Icon name="chevron" size={18} className="shrink-0 text-muted" /> : null}
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-calm';
  if (href) return <a href={href} className={`${cls} hover:bg-raised`}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} hover:bg-raised`}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-e1 ${className}`}>{children}</div>;
}

export function Avatar({ name, icon, size = 40 }: { name?: string; icon?: IconName; size?: number }) {
  const initials = name
    ?.split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full border border-border bg-raised font-semibold text-text" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {icon ? <Icon name={icon} size={size * 0.5} /> : initials}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'accent'; children: ReactNode }) {
  const tones = {
    neutral: 'text-muted border-border',
    positive: 'text-positive border-positive/40',
    warning: 'text-warning border-warning/40',
    negative: 'text-negative border-negative/40',
    accent: 'text-accent border-accent/40',
  };
  return <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-caption font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Utilisation and similar: labelled for assistive tech, tone by threshold. */
export function ProgressBar({ value, label, warnAt = 0.7, alertAt = 0.85 }: { value: number; label: string; warnAt?: number; alertAt?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const tone = v >= alertAt ? 'bg-negative' : v >= warnAt ? 'bg-warning' : 'bg-accent';
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${tone} transition-calm`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
