'use client';

import { ApiError, credApi, formatBps, formatInr, type EndpointResponse } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useState } from 'react';
import { credAdmin } from '@/lib/api';
import { Page, Section, Tag, useAdmin } from '../_ui';

type Rule = EndpointResponse<typeof credApi.admin.rules>['rules'][number];

/** Human units for editing: % for basis points, ₹ for paise, × for multiples. */
const toInput = (r: Pick<Rule, 'unit'>, v: number) => (r.unit === 'bps' ? String(v / 100) : r.unit === 'paise' ? String(v / 100) : r.unit === 'multiple_bps' ? String(v / 10_000) : String(v));
const fromInput = (r: Pick<Rule, 'unit'>, s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Math.round(r.unit === 'bps' ? n * 100 : r.unit === 'paise' ? n * 100 : r.unit === 'multiple_bps' ? n * 10_000 : n);
};
const suffix = (r: Pick<Rule, 'unit'>) => ({ bps: '%', paise: '₹', multiple_bps: '×', days: 'days', months: 'months', count: '' })[r.unit];

function RuleRow({ r, onSaved }: { r: Rule; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toInput(r, r.value));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await credAdmin(credApi.admin.updateRule, { params: { key: r.key }, body: { value: fromInput(r, value), reason: reason.trim() } });
      setEditing(false);
      setReason('');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed');
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {r.label} {r.changed ? <Tag tone="accent">changed</Tag> : null}
          </p>
          <p className="text-xs text-muted">{r.description}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            {r.key} · default {toInput(r, r.defaultValue)}
            {suffix(r)} · allowed {toInput(r, r.min)}–{toInput(r, r.max)}
            {suffix(r)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular">{r.display}</span>
          {!editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-raised p-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            New value ({suffix(r) || 'number'})
            <input className="w-36 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted">
            Reason (logged)
            <input className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button size="sm" loading={busy} disabled={reason.trim().length < 3} onClick={save}>
            Save
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error ? <p className="w-full text-xs text-negative">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Every threshold, cap and rate the engine uses. Editable live; each change is validated and logged. */
export default function RulesPage() {
  const q = useAdmin(() => credAdmin(credApi.admin.rules));
  const [busy, setBusy] = useState(false);
  const data = q.data;
  const groups = data ? [...new Set(data.rules.map((r) => r.group))] : [];
  const changed = data?.rules.filter((r) => r.changed).length ?? 0;

  async function resetAll() {
    setBusy(true);
    await credAdmin(credApi.admin.resetRules, { body: { reason: 'Reset all rules to defaults from the console' } }).catch(() => undefined);
    await q.refresh();
    setBusy(false);
  }

  return (
    <Page
      title="Rule settings"
      subtitle="The engine reads these on every decision. Changes apply at once, within safe ranges, and are logged with a reason."
      live={q.live}
      actions={
        changed ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={resetAll}>
            Reset {changed} to default
          </Button>
        ) : null
      }
    >
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      {groups.map((g) => (
        <Section key={g} title={g}>
          <Surface className="divide-y divide-border p-0">
            {data!.rules
              .filter((r) => r.group === g)
              .map((r) => (
                <RuleRow key={`${r.key}:${r.value}`} r={r} onSaved={q.refresh} />
              ))}
          </Surface>
        </Section>
      ))}
      {data ? (
        <Section title="Earned credit ladder tiers">
          <Surface className="divide-y divide-border p-0">
            {data.ladder.map((t) => (
              <div key={t.tier} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="capitalize">{t.tier}</span>
                <span className="text-muted">{t.requiredOnTimeMonths} bills in full in a row</span>
                <span className="tabular">
                  {formatInr(t.limitPaise)} from {formatBps(t.ratePaBps)}
                </span>
              </div>
            ))}
          </Surface>
        </Section>
      ) : null}
    </Page>
  );
}
