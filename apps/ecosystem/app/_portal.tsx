'use client';

import { ApiError, DEMO_PERSONAS } from '@cred/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/** The person on the page: ?c=per_<persona> (demo), default Aarav. */
export function useCustomer() {
  const c = useSearchParams().get('c');
  return DEMO_PERSONAS.some((p) => `per_${p.key}` === c) ? c! : 'per_aarav';
}

export function usePortal<T>(load: (customerRef: string) => Promise<T>) {
  const customerRef = useCustomer();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    load(customerRef).then(setData, (e) => setError(e instanceof ApiError ? e.message : 'Could not load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerRef]);
  return { data, error, customerRef };
}

/** An institution's portal frame: its own header, a demo switch between people, and the page. */
export function Portal({ brand, tagline, path, children }: { brand: string; tagline: string; path: string; children: ReactNode }) {
  const current = useCustomer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <span className="text-xl font-bold text-accent">{brand}</span>
            <span className="ml-3 text-sm text-muted">{tagline}</span>
          </div>
          <nav aria-label="Demo: whose account" className="flex flex-wrap gap-1 text-sm">
            {DEMO_PERSONAS.map((p) => (
              <a
                key={p.key}
                href={`${path}?c=per_${p.key}`}
                aria-current={current === `per_${p.key}` ? 'page' : undefined}
                className={`rounded-sm border px-2.5 py-1 ${current === `per_${p.key}` ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
              >
                {p.name.split(' ')[0]}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-8">{children}</main>
      <footer className="border-t border-border px-5 py-4 text-center text-xs text-muted">{brand} · simulated institution in the CRED prototype. Synthetic data only.</footer>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5 shadow-e1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function State({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <p role="alert" className="text-negative">{error}</p>;
  if (loading) return <p className="text-muted">Loading…</p>;
  return null;
}

export const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
