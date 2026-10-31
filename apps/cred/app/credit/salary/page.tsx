'use client';

import { credApi, type CreditLine } from '@cred/types';
import { Button, Card, ErrorState, Icon, LoadingScreen, Money, Notice, SectionHeader } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { longDate, rate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../_shell/Screen';

function Line({ title, line, muted }: { title: string; line: CreditLine; muted?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-md border border-border p-4 ${muted ? 'bg-surface' : 'bg-raised'}`}>
      <span className="text-caption text-muted">{title}</span>
      <Money paise={line.limitPaise} size="headline" />
      <span className="text-caption text-muted tabular">from {rate(line.ratePaBps)} a year</span>
    </div>
  );
}

/** Salary-Verified Credit: the member chooses to verify; the bank shares salary through the Account Aggregator. */
export default function Salary() {
  const q = useApi(credApi.member.income);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.member.startAaConsent, { body: { purpose: 'income_verification', returnTo: '/credit/salary' } });
      window.location.href = r.redirectUrl;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await api(credApi.member.withdrawPermission, { params: { scope: 'income_data' } });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Screen
      title="Verify your salary"
      back="/credit"
      footer={
        d && !d.income ? (
          <Button block loading={busy} onClick={verify}>
            Continue to Account Aggregator
          </Button>
        ) : null
      }
    >
      {q.error && !d ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !d ? (
        <LoadingScreen label="Loading" />
      ) : d.income && d.after ? (
        <>
          <Card elevation={2} className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-overline uppercase text-positive">
              <Icon name="check" size={16} /> Salary verified
            </p>
            <Money paise={d.income.monthlyNetPaise} size="title" />
            <p className="text-callout text-muted">
              A month from {d.income.employer}, seen in {d.income.monthsVerified} months of your bank account. Verified {longDate(d.income.verifiedAt.slice(0, 10))}.
            </p>
          </Card>
          <SectionHeader title="What it changed" />
          <div className="grid grid-cols-2 gap-3">
            <Line title="Before" line={d.before} muted />
            <Line title="Now available" line={d.after} />
          </div>
          <p className="text-caption text-muted">{d.after.note} Verifying never starts an offer by itself.</p>
          <Card className="flex flex-col gap-3">
            <p className="text-callout text-muted">We keep only the three facts above. The bank transactions we read are not stored.</p>
            <Button variant="secondary" loading={busy} onClick={turnOff}>
              Turn off and delete
            </Button>
          </Card>
        </>
      ) : (
        <>
          <p className="text-callout text-muted">Lenders price a verified salary lower. If you verify, a higher limit and a lower rate are available to you, only if you ever ask for credit.</p>
          {d.consent?.status === 'REJECTED' ? <Notice tone="info">You declined last time at the Account Aggregator, so nothing was shared.</Notice> : null}
          <Card className="flex flex-col gap-4">
            <h2 className="text-headline">How it works</h2>
            {[
              ['upi', 'You approve on SimAA, the Account Aggregator, and choose the bank account to share.'],
              ['doc', 'We read six months of that account once, to find your monthly salary.'],
              ['lock', 'We keep only your monthly salary, your employer and how many months we saw.'],
              ['shield', 'Turn it off any time in Permissions; we delete it straight away.'],
            ].map(([icon, text]) => (
              <p key={text} className="flex gap-3 text-callout">
                <Icon name={icon as 'upi'} size={20} className="mt-0.5 shrink-0 text-accent" />
                {text}
              </p>
            ))}
          </Card>
          <SectionHeader title="Today" />
          <Line title="Available on your current tier" line={d.before} muted />
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
