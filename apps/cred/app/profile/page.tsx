'use client';

import { credApi } from '@cred/types';
import { Avatar, Button, Card, ErrorState, List, ListRow, LoadingScreen } from '@cred/ui';
import { session } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

export default function Profile() {
  const q = useApi(credApi.member.home, undefined, { live: false });
  const m = q.data?.member;
  return (
    <Screen title="Profile" tab="profile">
      {q.error && !m ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !m ? (
        <LoadingScreen label="Loading profile" />
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <Avatar name={m.name} size={72} />
            <p className="text-title">{m.name}</p>
            <p className="text-caption text-muted">Member since {longDate(m.memberSince)}</p>
          </div>
          <Card className="p-0">
            <dl className="divide-y divide-border text-callout">
              {[
                ['Phone', m.phoneMasked],
                ['UPI ID', m.vpa],
                ['City', m.city],
              ].map(([k, v]) => (
                <div key={k} className="flex min-h-12 items-center justify-between px-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <List>
            <ListRow href="/profile/data" leading={<Avatar icon="list" />} title="Your data and decisions" subtitle="Every suggestion we considered, and why" />
            <ListRow href="/permissions" leading={<Avatar icon="shield" />} title="Permissions" subtitle="What you’ve allowed. Turn off in one tap" />
            <ListRow href="/loans" leading={<Avatar icon="loan" />} title="Your loans" subtitle="EMIs and schedules" />
            <ListRow href="/credit" leading={<Avatar icon="trend" />} title="Your credit" subtitle="Credit ladder and verified salary" />
            <ListRow href="/protect" leading={<Avatar icon="shield" />} title="Protect" subtitle="Cover, family, wellness and claims" />
            <ListRow href="/wealth" leading={<Avatar icon="chart" />} title="Your money" subtitle="Investments and goals" />
          </List>
          <Button
            variant="secondary"
            block
            onClick={() => {
              session.clear();
              window.location.href = '/';
            }}
          >
            Switch member
          </Button>
        </>
      )}
    </Screen>
  );
}
