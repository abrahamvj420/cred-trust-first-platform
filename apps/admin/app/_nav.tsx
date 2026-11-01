'use client';

import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Overview'],
  ['/members', 'Members'],
  ['/transactions', 'Transactions'],
  ['/decisions', 'Decisions'],
  ['/complaints', 'Complaints'],
  ['/audit', 'Permissions & audit'],
  ['/partners', 'Partners & webhooks'],
  ['/rules', 'Rule settings'],
  ['/demo', 'Control room'],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Console" className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface px-3 py-5">
      <span className="mb-4 px-3 text-sm font-semibold">
        CRED Console <span className="ml-1 rounded-sm border border-border px-1 text-xs font-normal text-muted">internal</span>
      </span>
      {LINKS.map(([href, label]) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <a key={href} href={href} aria-current={on ? 'page' : undefined} className={`rounded-md px-3 py-2 text-sm transition-calm ${on ? 'bg-raised font-semibold text-text' : 'text-muted hover:bg-raised hover:text-text'}`}>
            {label}
          </a>
        );
      })}
      <p className="mt-auto px-3 text-xs text-muted">Prototype · synthetic data only</p>
    </nav>
  );
}
