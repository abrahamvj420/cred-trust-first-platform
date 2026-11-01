'use client';

import { credApi, type LadderStatus } from '@cred/types';
import { Avatar, Badge, ButtonLink, Card, ErrorState, Icon, List, ListRow, LoadingScreen, Money, ProgressBar, SectionHeader } from '@cred/ui';
import { longDate, rate, shortDate, tierName } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const OUTCOME: Record<LadderStatus['history'][number]['outcome'], { text: string; tone: 'positive' | 'neutral' | 'warning' }> = {
  paid_in_full: { text: 'Paid in full', tone: 'positive' },
  part_paid: { text: 'Part paid', tone: 'neutral' },
  missed: { text: 'Missed', tone: 'warning' },
  open: { text: 'Due', tone: 'neutral' },
};

/** Earned Credit Ladder: tiers earned by paying bills in full, shown as available, never pushed. */
export default function Credit() {
  const ladder = useApi(credApi.member.creditLadder);
  const income = useApi(credApi.member.income);
  const l = ladder.data;
  const required = l?.tiers.find((t) => t.tier === l.nextTier)?.requiredOnTimeMonths ?? 0;

  return (
    <Screen title="Your credit" back="/">
      {ladder.error && !l ? (
        <ErrorState message={ladder.error} onRetry={ladder.reload} />
      ) : !l ? (
        <LoadingScreen label="Loading your credit" />
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-overline uppercase text-accent">
              <Icon name="trend" size={16} /> Earned credit ladder
            </p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-display">{tierName(l.tier)}</p>
                <p className="text-callout text-muted">
                  {l.onTimeStreak} {l.onTimeStreak === 1 ? 'bill' : 'bills'} in full, on time, in a row
                </p>
              </div>
              <Avatar icon="trend" size={48} />
            </div>
            {l.nextTier ? (
              <div className="flex flex-col gap-2">
                <ProgressBar value={required ? l.onTimeStreak / required : 0} label={`${l.onTimeStreak} of ${required} bills towards ${tierName(l.nextTier)}`} warnAt={2} alertAt={2} />
                <p className="text-caption text-muted">
                  {l.nextTierInMonths} more {l.nextTierInMonths === 1 ? 'bill' : 'bills'} paid in full to reach {tierName(l.nextTier)}
                </p>
              </div>
            ) : (
              <p className="text-caption text-muted">You’re at the top tier.</p>
            )}
          </Card>

          <section className="flex flex-col gap-3" aria-label="Available to you">
            <SectionHeader title="Available if you need it" />
            <Card className="flex flex-col gap-2">
              {l.creditLine.shown ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-callout text-muted">Up to</span>
                  <Money paise={l.creditLine.limitPaise} size="title" />
                </div>
              ) : null}
              {l.creditLine.shown ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-callout text-muted">From</span>
                  <span className="text-headline tabular">{rate(l.creditLine.ratePaBps)} a year</span>
                </div>
              ) : null}
              <p className="text-caption text-muted">
                {l.creditLine.shown ? `Yours if you ever need it${l.creditLine.basis === 'salary_verified' ? ', with your verified salary' : ''}. We won’t suggest you borrow.` : l.creditLine.note}
              </p>
              {!l.creditLine.shown ? (
                <a href="/repayment-plan" className="text-callout text-accent underline">
                  See a plan to clear your balance
                </a>
              ) : null}
            </Card>
          </section>

          <section className="flex flex-col gap-3" aria-label="Salary">
            <List>
              {income.data?.income ? (
                <ListRow
                  href="/credit/salary"
                  leading={<Avatar icon="check" />}
                  title="Salary verified"
                  subtitle={`${income.data.income.employer} · since ${longDate(income.data.income.verifiedAt.slice(0, 10))}`}
                  trailing={<Money paise={income.data.income.monthlyNetPaise} className="font-semibold" />}
                />
              ) : (
                <ListRow href="/credit/salary" leading={<Avatar icon="lock" />} title="Verify your salary" subtitle="A higher limit and a lower rate, if you ever need them" />
              )}
            </List>
          </section>

          <section className="flex flex-col gap-3" aria-label="Tiers">
            <SectionHeader title="Tiers" />
            <List>
              {l.tiers.map((t) => (
                <div key={t.tier} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <Avatar icon={t.unlocked ? 'check' : 'lock'} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body">{tierName(t.tier)}</span>
                    <span className="block text-caption text-muted">{t.requiredOnTimeMonths ? `${t.requiredOnTimeMonths} bills in full in a row` : 'Where everyone starts'}</span>
                  </span>
                  <span className="text-right">
                    <Money paise={t.limitPaise} className="block text-callout" />
                    <span className="block text-caption text-muted tabular">from {rate(t.ratePaBps)}</span>
                  </span>
                  {t.current ? <Badge tone="accent">You</Badge> : null}
                </div>
              ))}
            </List>
          </section>

          {l.history.length ? (
            <section className="flex flex-col gap-3" aria-label="Recent bills">
              <SectionHeader title="Recent bills" />
              <List>
                {l.history.map((h) => (
                  <div key={h.periodEnd} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="block text-body">Bill to {shortDate(h.periodEnd)}</span>
                      <span className="block text-caption text-muted">Due {shortDate(h.dueDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {h.counted ? <Icon name="check" size={18} className="text-positive" title="Counted towards your streak" /> : null}
                      <Badge tone={OUTCOME[h.outcome].tone}>{OUTCOME[h.outcome].text}</Badge>
                    </span>
                  </div>
                ))}
              </List>
            </section>
          ) : null}

          <section className="flex flex-col gap-3" aria-label="How it works">
            <SectionHeader title="How it works" />
            <Card className="flex flex-col gap-3">
              {l.howItWorks.map((x) => (
                <p key={x} className="flex gap-3 text-callout text-muted">
                  <Icon name="check" size={18} className="mt-0.5 shrink-0 text-accent" />
                  {x}
                </p>
              ))}
            </Card>
          </section>
          <ButtonLink href="/loans" variant="secondary" block>
            Your loans and EMIs
          </ButtonLink>
        </>
      )}
    </Screen>
  );
}
