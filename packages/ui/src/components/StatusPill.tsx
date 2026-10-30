export function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const tone = ok === null ? 'bg-muted' : ok ? 'bg-positive' : 'bg-negative';
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-raised px-2.5 py-1 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden />
      {label}
    </span>
  );
}
