'use client';

import { credApi } from '@cred/types';
import { Badge, Card, ErrorState, Icon, LoadingScreen, SectionHeader } from '@cred/ui';
import { useApi } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

const PERMISSION: Record<string, string> = { income_data: 'Salary', portfolio_data: 'Investments', insurance_data: 'Insurance', health_data: 'Activity', smart_savings: 'Smart Savings' };

export default function WhatCredKnows() {
  const q = useApi(credApi.privacy.whatCredKnows, undefined, { live: false });
  return (
    <Screen title="What CRED knows" back="/profile/privacy">
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading what we know" />
      ) : (
        <>
          {q.data.sections.map((s) => (
            <Card key={s.title} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-headline">{s.title}</h2>
                {s.permission ? <Badge tone="accent">{PERMISSION[s.permission]} permission</Badge> : <Badge>Needed for your account</Badge>}
              </div>
              <p className="text-caption text-muted">From: {s.source}</p>
              <dl className="flex flex-col gap-1 text-callout">
                {s.items.map((i) => (
                  <div key={i.label} className="flex justify-between gap-4">
                    <dt className="text-muted">{i.label}</dt>
                    <dd className="text-right">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
          <SectionHeader title="What CRED never holds" />
          <Card className="flex flex-col gap-2">
            {q.data.neverHeld.map((n) => (
              <p key={n} className="flex gap-2 text-callout text-muted">
                <Icon name="close" size={18} className="mt-0.5 shrink-0" /> {n}
              </p>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
