'use client';

import { credApi } from '@cred/types';
import { Avatar, Badge, ButtonLink, Card, EmptyState, ErrorState, Icon, List, ListRow, LoadingScreen, Money, ProgressBar, SectionHeader } from '@cred/ui';
import { dateTime, longDate, pct } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

/** Wealth Management: tracking, goals and fees disclosed. Guidance only, no products. */
export default function Wealth() {
  const p = useApi(credApi.products.holdings);
  const goals = useApi(credApi.products.goals);
  const d = p.data;

  return (
    <Screen title="Your money" back="/">
      {p.error && !d ? (
        <ErrorState message={p.error} onRetry={p.reload} />
      ) : !d ? (
        <LoadingScreen label="Loading your investments" />
      ) : !d.holdings.length ? (
        <>
          <EmptyState
            icon="chart"
            title="See all your investments in one place"
            body="Link your funds and deposits through the Account Aggregator. Only you decide what’s shared."
            action={<ButtonLink href="/wealth/link">Link investments</ButtonLink>}
          />
          <ButtonLink href="/wealth/gold" variant="secondary" block>
            Add gold you own
          </ButtonLink>
        </>
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-3">
            <p className="text-caption text-muted">Total value</p>
            <Money paise={d.totalValuePaise} size="display" />
            <p className={`flex items-center gap-1 text-callout ${d.gainPaise >= 0 ? 'text-positive' : 'text-negative'}`}>
              <Icon name={d.gainPaise >= 0 ? 'arrowUp' : 'arrowDown'} size={16} />
              <Money paise={Math.abs(d.gainPaise)} /> {d.gainPaise >= 0 ? 'more' : 'less'} than you put in (<Money paise={d.totalCostPaise} />)
            </p>
            <p className="text-caption text-muted">
              {d.linked ? `Linked through SimAA${d.lastFetchedAt ? ` · updated ${dateTime(d.lastFetchedAt)}` : ''}` : 'Not linked: only what you declared'}
            </p>
          </Card>

          <Card className="flex items-start gap-3">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-callout">
              You pay about <Money paise={d.annualFeesPaise} className="font-semibold" /> a year in fund fees. They go to the fund houses; CRED earns none of it.
            </p>
          </Card>

          <section className="flex flex-col gap-3" aria-label="Mix">
            <SectionHeader title="Your mix" />
            <Card className="flex flex-col gap-4">
              {d.allocation.map((a) => (
                <div key={a.assetClass} className="flex flex-col gap-2">
                  <div className="flex justify-between text-callout">
                    <span>{a.label}</span>
                    <span className="tabular text-muted">
                      {pct(a.shareBps)} · <Money paise={a.valuePaise} />
                    </span>
                  </div>
                  <ProgressBar value={a.shareBps / 10_000} label={`${a.label}: ${pct(a.shareBps)} of your investments`} warnAt={2} alertAt={2} />
                </div>
              ))}
            </Card>
          </section>

          <section className="flex flex-col gap-3" aria-label="Holdings">
            <SectionHeader title="Holdings" action={<a href="/wealth/gold" className="flex min-h-11 items-center text-callout text-accent">Add gold</a>} />
            <List>
              {d.holdings.map((h) => (
                <ListRow
                  key={h.id}
                  href={`/wealth/holdings/${h.id}`}
                  leading={<Avatar icon={h.kind === 'gold' ? 'gift' : h.kind === 'fixed_deposit' ? 'lock' : 'chart'} />}
                  title={h.name}
                  subtitle={
                    <>
                      {h.provider}
                      {h.pledged ? ' · pledged for a loan' : ''}
                    </>
                  }
                  trailing={<Money paise={h.valuePaise} className="font-semibold" />}
                />
              ))}
            </List>
            {!d.linked ? (
              <ButtonLink href="/wealth/link" variant="secondary" block>
                Link funds and deposits
              </ButtonLink>
            ) : null}
          </section>

          <section className="flex flex-col gap-3" aria-label="Goals">
            <SectionHeader title="Goals" action={<a href="/wealth/goals/new" className="flex min-h-11 items-center text-callout text-accent">Add a goal</a>} />
            {goals.data?.goals.length ? (
              goals.data.goals.map((g) => (
                <a key={g.id} href={`/wealth/goals/${g.id}`} className="block rounded-lg">
                  <Card interactive className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-headline">{g.name}</p>
                        <p className="text-caption text-muted">
                          <Money paise={g.targetPaise} /> by {longDate(g.targetDate)}
                        </p>
                      </div>
                      {g.onTrack ? <Badge tone="positive">On track</Badge> : null}
                    </div>
                    <ProgressBar value={g.currentPaise / g.targetPaise} label={`${Math.round((g.currentPaise * 100) / g.targetPaise)}% of ${g.name}`} warnAt={2} alertAt={2} />
                    <p className="text-callout">
                      {g.onTrack ? (
                        'What you’ve set aside should get you there.'
                      ) : (
                        <>
                          Invest <Money paise={g.monthlyPlanPaise} className="font-semibold" /> a month for {g.monthsLeft} months
                        </>
                      )}
                    </p>
                  </Card>
                </a>
              ))
            ) : (
              <EmptyState icon="spark" title="No goals yet" body="Name something you’re saving for and we’ll work out a monthly plan, fees included." action={<ButtonLink href="/wealth/goals/new" size="sm">Add a goal</ButtonLink>} />
            )}
          </section>
          <p className="text-caption text-muted">Guidance only. Nothing on this screen is a product or a recommendation to buy one, and CRED isn’t paid for any of it.</p>
        </>
      )}
    </Screen>
  );
}
