'use client';

import { credApi, type EndpointResponse, type Loan } from '@cred/types';
import { Button, Money, Surface } from '@cred/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText, session, useMemberStream } from '@/lib/api';
import { HelpCard, OfferCard, SmartSavingsCard } from './Cards';

type HomeData = EndpointResponse<typeof credApi.member.home>;
type Offers = EndpointResponse<typeof credApi.products.offers>;
type Txn = EndpointResponse<typeof credApi.member.transactions>['transactions'][number];

export function Home({ token }: { token: string }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [offers, setOffers] = useState<Offers | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, o, l, t] = await Promise.all([
        api(credApi.member.home),
        api(credApi.products.offers),
        api(credApi.products.loans),
        api(credApi.member.transactions, { query: { limit: 8 } }),
      ]);
      setHome(h);
      setOffers(o);
      setLoans(l.loans);
      setTxns(t.transactions);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live: every pushed event refreshes the screen, no reload needed.
  useMemberStream(token, (e) => {
    if (e.type === 'heartbeat') return;
    setLive(`${e.type} · ${new Date(e.at).toLocaleTimeString('en-IN')}`);
    void refresh();
  });

  if (error) return <p className="p-6 text-negative">{error}</p>;
  if (!home || !offers) return <p className="p-6 text-muted">Loading…</p>;
  const card = home.cards[0];
  const active = offers.active;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-xl font-semibold">{home.member.name}</h1>
        </div>
        <Button variant="ghost" onClick={() => { session.clear(); window.location.href = '/'; }}>Switch member</Button>
      </header>

      {card ? (
        <Surface className="flex flex-col gap-2">
          <p className="text-sm text-muted">{card.issuerName} {card.network.toUpperCase()} ···· {card.last4}</p>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Outstanding</span>
            <Money paise={card.outstandingPaise} className="text-2xl font-semibold" />
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>Available <Money paise={card.availablePaise} /></span>
            <span>Limit <Money paise={card.limitPaise} /></span>
          </div>
          {home.nextBill ? (
            <p className="text-sm">
              Bill <Money paise={home.nextBill.totalDuePaise} /> due {home.nextBill.dueDate}
            </p>
          ) : null}
        </Surface>
      ) : null}

      {active?.status === 'awaiting_permission' ? <SmartSavingsCard offer={active} onDone={refresh} /> : null}
      {active?.status === 'shown' ? <OfferCard offer={active} onDone={refresh} /> : null}
      {offers.help.map((h) => <HelpCard key={h.id} help={h} />)}

      {loans.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Your EMIs</h2>
          {loans.map((l) => (
            <a key={l.id} href={`/loans/${l.id}`}>
              <Surface className="flex items-center justify-between hover:border-accent">
                <span>
                  {l.lenderName} · {l.tenureMonths} months
                  <span className="block text-xs text-muted">{l.status}</span>
                </span>
                <span className="text-right">
                  <Money paise={l.emiPaise} className="font-semibold" />
                  <span className="block text-xs text-muted">a month</span>
                </span>
              </Surface>
            </a>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recent card spends</h2>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {txns.map((t) => (
            <li key={t.id} className="flex justify-between px-4 py-3 text-sm">
              <span>
                {t.merchant}
                <span className="block text-xs text-muted">{new Date(t.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </span>
              <Money paise={t.amountPaise} />
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-muted">{live ? `Live · last event ${live}` : 'Live updates on'}</p>
    </main>
  );
}
