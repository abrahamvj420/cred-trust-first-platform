'use client';

import { credApi, formatInr } from '@cred/types';
import { Avatar, EmptyState, ErrorState, Icon, List, ListRow, LoadingScreen, Money, SectionHeader } from '@cred/ui';
import { useApi } from '@/lib/live';
import { firstName, greeting, shortDate } from '@/lib/format';
import { Screen } from '../_shell/Screen';
import { BillCard } from './BillCard';
import { CardTile } from './CardTile';
import { HelpCard, OfferCard, SmartSavingsCard } from './Cards';

export function Home() {
  const home = useApi(credApi.member.home);
  const offers = useApi(credApi.products.offers);
  const loans = useApi(credApi.products.loans);
  const reload = () => {
    home.reload();
    offers.reload();
  };

  return (
    <Screen tab="home">
      {home.error && !home.data ? (
        <ErrorState message={home.error} onRetry={home.reload} />
      ) : !home.data ? (
        <LoadingScreen label="Loading your home" />
      ) : (
        <>
          <header className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-callout text-muted">{greeting()},</p>
              <h1 className="truncate text-title">{firstName(home.data.member.name)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/rewards"
                aria-label={`${home.data.rewardsCoins.toLocaleString('en-IN')} reward coins`}
                className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-callout font-semibold shadow-e1 transition-calm hover:border-muted"
              >
                <Icon name="gift" size={18} className="text-accent" />
                <span className="tabular">{home.data.rewardsCoins.toLocaleString('en-IN')}</span>
              </a>
              <a href="/profile" aria-label="Profile" className="rounded-full">
                <Avatar name={home.data.member.name} size={44} />
              </a>
            </div>
          </header>

          <section className="flex flex-col gap-3" aria-label="Upcoming bills">
            <SectionHeader title="Upcoming bills" />
            {home.data.cards.some((c) => c.nextDue) ? (
              home.data.cards.map((c) => <BillCard key={c.id} card={c} today={home.data!.simDate} />)
            ) : (
              <EmptyState icon="card" title="No bills yet" body="Your first statement will show up here." />
            )}
          </section>

          {offers.data?.active?.status === 'awaiting_permission' ? <SmartSavingsCard offer={offers.data.active} onDone={reload} /> : null}
          {offers.data?.active?.status === 'shown' ? <OfferCard offer={offers.data.active} onDone={reload} /> : null}
          {offers.data?.help.map((h) => <HelpCard key={h.id} help={h} />)}

          <section className="flex flex-col gap-3" aria-label="Your cards">
            <SectionHeader title="Your cards" action={<a href="/cards" className="flex min-h-11 items-center text-callout text-accent">See all</a>} />
            {home.data.cards.map((c) => (
              <CardTile key={c.id} card={c} href={`/cards/${c.id}`} compact />
            ))}
          </section>

          {loans.data && loans.data.loans.some((l) => l.status === 'disbursed') ? (
            <section className="flex flex-col gap-3" aria-label="Your EMIs">
              <SectionHeader title="Your EMIs" action={<a href="/loans" className="flex min-h-11 items-center text-callout text-accent">See all</a>} />
              <List>
                {loans.data.loans
                  .filter((l) => l.status === 'disbursed')
                  .map((l) => {
                    const next = l.schedule.find((i) => i.status !== 'paid');
                    return (
                      <ListRow
                        key={l.id}
                        href={`/loans/${l.id}`}
                        leading={<Avatar icon="loan" />}
                        title={l.lenderName}
                        subtitle={next ? `Next EMI ${shortDate(next.dueDate)}` : 'All paid'}
                        trailing={<Money paise={l.emiPaise} className="font-semibold" />}
                      />
                    );
                  })}
              </List>
            </section>
          ) : null}

          <section className="flex flex-col gap-3" aria-label="Pay someone">
            <List>
              <ListRow href="/upi" leading={<Avatar icon="upi" />} title="Pay by UPI" subtitle="Friends, shops, any UPI ID" />
              <ListRow
                href="/rewards"
                leading={<Avatar icon="gift" />}
                title="Rewards"
                subtitle={`About ${formatInr(Math.floor(home.data.rewardsCoins / 50) * 100)} in vouchers to redeem`}
              />
            </List>
          </section>
        </>
      )}
    </Screen>
  );
}
