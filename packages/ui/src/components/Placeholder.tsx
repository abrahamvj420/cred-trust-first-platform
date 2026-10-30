import type { ReactNode } from 'react';

/** Milestone placeholder page: brand name, purpose, what lands next. */
export function Placeholder({ brand, title, children, next }: { brand: string; title: string; children?: ReactNode; next: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{brand}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children ? <div className="text-muted">{children}</div> : null}
      <p className="text-sm text-muted">Coming in {next}.</p>
    </main>
  );
}
