'use client';

import { credApi } from '@cred/types';
import { Avatar, Button, Card, List, ListRow, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

/** The privacy area: what you allowed, what CRED knows, every decision, download, delete. */
export default function Privacy() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const data = await api(credApi.privacy.exportData);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cred-my-data-${data.generatedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Screen title="Privacy" back="/profile">
      <p className="text-callout text-muted">Your data is yours. See it, take it with you, or have us delete it. Everything you do here is logged.</p>
      <List>
        <ListRow href="/permissions" leading={<Avatar icon="shield" />} title="Permissions" subtitle="What you’ve allowed and linked. Turn off in one tap" />
        <ListRow href="/profile/privacy/knows" leading={<Avatar icon="lock" />} title="What CRED knows about me" subtitle="Everything we hold, and where it came from" />
        <ListRow href="/profile/data" leading={<Avatar icon="list" />} title="Your data and decisions" subtitle="Every suggestion we considered, and why" />
      </List>
      <Card className="flex flex-col gap-3">
        <h2 className="text-headline">Download my data</h2>
        <p className="text-callout text-muted">A JSON file with everything CRED holds about you: permissions, links, transactions, decisions, offers, loans, holdings, policies and the log.</p>
        <Button variant="secondary" loading={busy} onClick={download}>
          Download (JSON)
        </Button>
        {done ? <Notice tone="positive">Downloaded. Keep it somewhere safe; it has your financial details.</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
      </Card>
      <List>
        <ListRow href="/profile/privacy/delete" leading={<Avatar icon="close" />} title="Delete my data" subtitle="What’s deleted, and what must be kept" />
      </List>
    </Screen>
  );
}
