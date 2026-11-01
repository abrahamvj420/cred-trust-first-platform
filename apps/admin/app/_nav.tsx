'use client';

import { credApi } from '@cred/types';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { credAdmin, staffSession } from '@/lib/api';

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

/** Sidebar with the signed-in staff member. Every page except sign-in requires a staff session. */
export function Nav() {
  const path = usePathname();
  const [staff, setStaff] = useState<{ name: string } | null>(null);
  useEffect(() => {
    if (path === '/login') return;
    if (!staffSession.get()) {
      window.location.href = `/login?next=${encodeURIComponent(path)}`;
      return;
    }
    credAdmin(credApi.admin.me).then(setStaff, () => undefined);
  }, [path]);
  if (path === '/login') return null;
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
      <div className="mt-auto flex flex-col gap-2 px-3">
        {staff ? <span className="text-xs">Signed in as {staff.name}</span> : null}
        <button
          type="button"
          className="self-start text-xs text-muted underline hover:text-text"
          onClick={() => {
            staffSession.clear();
            window.location.href = '/login';
          }}
        >
          Sign out
        </button>
        <p className="text-xs text-muted">Prototype · synthetic data only</p>
      </div>
    </nav>
  );
}
