'use client';

import { credApi } from '@cred/types';
import { Avatar, Badge, Button, EmptyState, ErrorState, Field, List, ListRow, LoadingScreen, Money, SectionHeader } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const payHref = (vpa: string, name: string) => `/upi/pay?vpa=${encodeURIComponent(vpa)}&name=${encodeURIComponent(name)}`;

export default function UpiHome() {
  const contacts = useApi(credApi.member.upiContacts);
  const history = useApi(credApi.member.upiHistory);
  const [vpa, setVpa] = useState('');
  const [check, setCheck] = useState<{ busy: boolean; error: string | null; name: string | null }>({ busy: false, error: null, name: null });

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setCheck({ busy: true, error: null, name: null });
    try {
      const r = await api(credApi.member.upiResolve, { query: { vpa: vpa.trim() } });
      if (r.valid && r.name) window.location.href = payHref(r.vpa, r.name);
      else setCheck({ busy: false, error: 'We couldn’t find that UPI ID. Check it and try again.', name: null });
    } catch (err) {
      setCheck({ busy: false, error: errorText(err), name: null });
    }
  }

  return (
    <Screen title="Pay by UPI" tab="upi">
      <form onSubmit={verify} className="flex flex-col gap-3">
        <Field
          label="UPI ID"
          placeholder="name@bank"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={vpa}
          onChange={(e) => {
            setVpa(e.target.value);
            setCheck({ busy: false, error: null, name: null });
          }}
          error={check.error}
          hint="We’ll show the registered name before you pay."
        />
        <Button type="submit" variant="secondary" loading={check.busy} disabled={vpa.trim().length < 3}>
          Verify and continue
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <SectionHeader title="People and shops" />
        {contacts.error && !contacts.data ? (
          <ErrorState message={contacts.error} onRetry={contacts.reload} />
        ) : !contacts.data ? (
          <LoadingScreen label="Loading contacts" />
        ) : contacts.data.contacts.length === 0 ? (
          <EmptyState icon="user" title="No contacts on UPI yet" />
        ) : (
          <List>
            {contacts.data.contacts.map((c) => (
              <ListRow key={c.vpa} href={payHref(c.vpa, c.name)} leading={<Avatar name={c.name} />} title={c.name} subtitle={c.vpa} trailing={c.recent ? <Badge>Recent</Badge> : null} />
            ))}
          </List>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Recent payments" />
        {history.data && history.data.payments.length === 0 ? (
          <EmptyState icon="upi" title="No UPI payments yet" body="Payments you make from CRED show up here." />
        ) : history.data ? (
          <List>
            {history.data.payments.map((p) => (
              <ListRow
                key={p.id}
                href={`/upi/${p.id}`}
                leading={<Avatar name={p.payeeName ?? p.payeeVpa} />}
                title={p.payeeName ?? p.payeeVpa}
                subtitle={`${dateTime(p.createdAt)}${p.note ? ` · ${p.note}` : ''}`}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <Money paise={-p.amountPaise} className="font-semibold" />
                    {p.status === 'failed' ? <Badge tone="negative">Failed</Badge> : null}
                  </span>
                }
                chevron={false}
              />
            ))}
          </List>
        ) : null}
      </section>
    </Screen>
  );
}
