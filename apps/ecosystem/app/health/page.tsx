'use client';

import { ecosystemApi } from '@cred/types';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { Panel, Portal, State, usePortal } from '../_portal';

/** The health app: raw daily steps stay here; apps you share with get a weekly summary only. */
function Health() {
  const q = usePortal((c) => ecosystem(ecosystemApi.wearable.days, { params: { customerRef: c } }));
  const d = q.data;
  const max = Math.max(1, ...(d?.days.map((x) => x.steps) ?? [1]));
  return (
    <Portal brand="Health" tagline="Apple Health / Health Connect (simulated)" path="/health">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <h1 className="text-2xl font-semibold">{d.personName.split(' ')[0]}’s activity</h1>
          <Panel title="Daily steps (stay on this device)">
            {d.days.length ? (
              <div className="flex h-40 items-end gap-1" role="img" aria-label={`Daily steps for the last ${d.days.length} days`}>
                {[...d.days].reverse().map((x) => (
                  <div key={x.date} title={`${x.date}: ${x.steps.toLocaleString('en-IN')} steps`} className="flex-1 rounded-t-sm bg-accent" style={{ height: `${Math.max(4, (x.steps / max) * 100)}%` }} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No activity recorded.</p>
            )}
          </Panel>
          <Panel title="Shared with">
            {d.sharedWith.length ? (
              d.sharedWith.map((s) => (
                <p key={s.app} className="text-sm">
                  <span className="font-semibold">{s.app}</span>: {s.what}. Never daily steps, heart rate or location.
                </p>
              ))
            ) : (
              <p className="text-sm text-muted">Not shared with any app.</p>
            )}
          </Panel>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Health />
    </Suspense>
  );
}
