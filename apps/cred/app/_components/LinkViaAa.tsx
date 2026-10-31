'use client';

import { credApi, type AaPurpose } from '@cred/types';
import { Button, Card, Icon, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../_shell/Screen';

/** Shared by Wealth and Protect: what's asked for, why, and for how long, before going to the Account Aggregator. */
export function LinkViaAa({ purpose, returnTo, title, points, cta }: { purpose: AaPurpose; returnTo: string; title: string; points: string[]; cta: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.member.startAaConsent, { body: { purpose, returnTo } });
      window.location.href = r.redirectUrl;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <Screen
      title={title}
      back={returnTo}
      footer={
        <Button block loading={busy} onClick={go}>
          {cta}
        </Button>
      }
    >
      <Card className="flex flex-col gap-4">
        {points.map((p, i) => (
          <p key={p} className="flex gap-3 text-callout">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-raised text-caption font-semibold text-accent">{i + 1}</span>
            {p}
          </p>
        ))}
      </Card>
      <p className="flex items-start gap-2 text-caption text-muted">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0" /> SimAA is this demo’s Account Aggregator. It can’t read your data; it only passes on what you approve.
      </p>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

