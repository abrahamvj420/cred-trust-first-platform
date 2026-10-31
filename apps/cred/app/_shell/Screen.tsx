'use client';

import { Icon } from '@cred/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { session } from '@/lib/api';
import { TabBar, type Tab } from './TabBar';

/**
 * Every signed-in screen: optional top bar with back, scrollable content,
 * and the tab bar on top-level screens. Redirects to sign-in without a session.
 */
export function Screen({ title, back, tab, actions, children, footer }: { title?: string; back?: string | true; tab?: Tab; actions?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!session.get()) router.replace('/');
    else setReady(true);
  }, [router]);
  if (!ready) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {title || back ? (
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-1 border-b border-border/60 bg-bg/85 px-2 backdrop-blur-md">
          {back ? (
            <button
              onClick={() => (back === true ? router.back() : router.push(back))}
              aria-label="Back"
              className="grid h-11 w-11 place-items-center rounded-full text-text transition-calm hover:bg-raised"
            >
              <Icon name="back" />
            </button>
          ) : (
            <span className="w-3" />
          )}
          <h1 className="flex-1 truncate text-headline">{title}</h1>
          {actions}
        </header>
      ) : null}
      <main className="flex flex-1 animate-enter flex-col gap-section px-gutter pt-5 pb-8">{children}</main>
      {footer ? <div className="sticky bottom-0 z-20 border-t border-border/60 bg-bg/90 px-gutter py-4 backdrop-blur-md">{footer}</div> : null}
      {tab ? <TabBar active={tab} /> : null}
    </div>
  );
}
