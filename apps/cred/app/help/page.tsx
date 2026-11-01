'use client';

import { credApi, type ComplaintCategory } from '@cred/types';
import { Badge, Button, Card, Choice, EmptyState, ErrorState, Field, LoadingScreen, Notice, SectionHeader } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const CATEGORIES: { value: ComplaintCategory; title: string }[] = [
  { value: 'offer', title: 'A suggestion or offer' },
  { value: 'loan', title: 'A loan or EMI' },
  { value: 'claim', title: 'An insurance claim' },
  { value: 'payment', title: 'A payment' },
  { value: 'data_privacy', title: 'My data or privacy' },
  { value: 'other', title: 'Something else' },
];

/** Raise a concern: a person at CRED reads it and replies here. */
export default function Help() {
  const q = useApi(credApi.products.complaints);
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.fileComplaint, { body: { category: category!, message: message.trim() } });
      setSent(true);
      setCategory(null);
      setMessage('');
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Screen title="Help and complaints" back="/profile">
      <Card className="flex flex-col gap-4">
        <h2 className="text-headline">Tell us what went wrong</h2>
        <Choice legend="It’s about" name="category" value={category} onChange={setCategory} options={CATEGORIES} />
        <Field label="What happened" value={message} maxLength={600} onChange={(e) => setMessage(e.target.value)} hint="A person at CRED reads every one and replies here." />
        <Button loading={busy} disabled={!category || message.trim().length < 5} onClick={send}>
          Send
        </Button>
        {sent ? <Notice tone="positive">Sent. We’ll reply here.</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
      </Card>
      <SectionHeader title="Your concerns" />
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading" />
      ) : !q.data.complaints.length ? (
        <EmptyState icon="doc" title="Nothing raised" body="If something isn’t right, tell us above." />
      ) : (
        q.data.complaints.map((c) => (
          <Card key={c.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-muted">
                {CATEGORIES.find((x) => x.value === c.category)?.title} · {longDate(c.createdAt.slice(0, 10))}
              </span>
              <Badge tone={c.status === 'resolved' ? 'positive' : 'accent'}>{c.status === 'resolved' ? 'Answered' : 'With our team'}</Badge>
            </div>
            <p className="text-callout">{c.message}</p>
            {c.resolution ? <p className="rounded-md bg-raised p-3 text-callout text-muted">{c.resolution}</p> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
