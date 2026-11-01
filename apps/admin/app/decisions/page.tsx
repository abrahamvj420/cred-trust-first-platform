'use client';

import { credApi, DecisionOutcome, FeatureKey } from '@cred/types';
import { useState } from 'react';
import { credAdmin } from '@/lib/api';
import { DecisionCard, feature, Page, useAdmin } from '../_ui';

/** Every engine decision, offer or not, with each check and what the member was told. */
export default function Decisions() {
  const [f, setF] = useState<string>('');
  const [o, setO] = useState<string>('');
  const q = useAdmin(
    () =>
      credAdmin(credApi.admin.decisions, {
        query: { limit: 100, ...(f ? { feature: FeatureKey.parse(f) } : {}), ...(o ? { outcome: DecisionOutcome.parse(o) } : {}) },
      }),
    [f, o],
  );
  const select = 'rounded-md border border-border bg-surface px-3 py-2 text-sm';
  return (
    <Page
      title="Decisions"
      subtitle="Every evaluated check is saved, including offers not made and why"
      live={q.live}
      actions={
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="feature">
            Feature
          </label>
          <select id="feature" className={select} value={f} onChange={(e) => setF(e.target.value)}>
            <option value="">All features</option>
            {FeatureKey.options.map((x) => (
              <option key={x} value={x}>
                {feature(x)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="outcome">
            Outcome
          </label>
          <select id="outcome" className={select} value={o} onChange={(e) => setO(e.target.value)}>
            <option value="">All outcomes</option>
            {DecisionOutcome.options.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      <div className="flex flex-col gap-2">
        {(q.data?.decisions ?? []).map((d) => (
          <DecisionCard key={d.id} d={d} />
        ))}
        {q.data && !q.data.decisions.length ? <p className="text-sm text-muted">No decisions match.</p> : null}
      </div>
    </Page>
  );
}
