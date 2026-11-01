'use client';

import { credApi } from '@cred/types';
import { Button, Card, Field, Icon, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText, session } from '@/lib/api';
import { Screen } from '../../../_shell/Screen';

const DELETED = [
  'Your card, bills and transactions as CRED received them',
  'Permissions and Account Aggregator links (revoked at the source first)',
  'Verified salary, linked investments, declared gold and goals',
  'Linked policies and family details',
  'Activity summaries (and sharing from your health app stops)',
  'Suggestions and decisions, rewards, alerts and UPI history in CRED',
];

/** Delete my data: typed confirmation; says exactly what's deleted and what must be kept, and why. */
export default function DeleteData() {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retained, setRetained] = useState<string[] | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.privacy.deleteData, { body: { confirm: 'DELETE' } });
      setRetained(r.retainedForLaw);
      session.clear();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (retained) {
    return (
      <main className="flex min-h-full flex-col gap-section px-gutter py-10">
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-positive">
            <Icon name="check" />
          </span>
          <h1 className="text-title">Your data is deleted</h1>
          <p className="text-callout text-muted">Sharing is stopped at the source and you’re signed out.</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="text-headline">What we had to keep</h2>
          {retained.map((r) => (
            <p key={r} className="text-callout text-muted">
              {r}
            </p>
          ))}
        </Card>
        <Button variant="secondary" onClick={() => (window.location.href = '/')}>
          Done
        </Button>
      </main>
    );
  }

  return (
    <Screen
      title="Delete my data"
      back="/profile/privacy"
      footer={
        <Button block loading={busy} disabled={typed !== 'DELETE'} onClick={del}>
          Delete my data
        </Button>
      }
    >
      <Card className="flex flex-col gap-2">
        <h2 className="text-headline">What we’ll delete</h2>
        {DELETED.map((d) => (
          <p key={d} className="flex gap-2 text-callout text-muted">
            <Icon name="check" size={18} className="mt-0.5 shrink-0 text-accent" /> {d}
          </p>
        ))}
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="text-headline">What must be kept</h2>
        <p className="text-callout text-muted">
          Loans and insurance policies you took through CRED are held by the lender or insurer, and stay with them until they end; CRED keeps a record of them as lending and insurance rules require. We also keep the log of what we did with your
          permission, and any open complaint.
        </p>
      </Card>
      <Field label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" hint="This can’t be undone. You’ll be signed out." />
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
