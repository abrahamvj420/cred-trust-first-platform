'use client';

import { credApi, type RewardItem } from '@cred/types';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, List, ListRow, LoadingScreen, Money, Notice, SectionHeader, Sheet } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../_shell/Screen';

const coins = (n: number) => n.toLocaleString('en-IN');

export default function Rewards() {
  const q = useApi(credApi.member.rewards);
  const [pick, setPick] = useState<RewardItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.member.redeemReward, { body: { rewardId: pick.id } });
      setResult({ code: r.voucherCode, title: `${r.reward.title} · ${r.reward.brand}` });
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }
  const close = () => {
    setPick(null);
    setResult(null);
    setError(null);
  };

  const d = q.data;
  return (
    <Screen title="Rewards" tab="rewards">
      {q.error && !d ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !d ? (
        <LoadingScreen label="Loading rewards" />
      ) : (
        <>
          <Card elevation={2} className="flex flex-col gap-2 bg-gradient-to-br from-raised to-surface">
            <p className="flex items-center gap-2 text-overline uppercase text-accent">
              <Icon name="gift" size={16} /> Your coins
            </p>
            <p className="tabular text-display">{coins(d.balance)}</p>
            <p className="text-callout text-muted">Earn 10 coins for every ₹100 of card bill you pay on time.</p>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Redeem" />
            <div className="grid grid-cols-2 gap-3">
              {d.catalog.map((r) => {
                const short = r.costCoins - d.balance;
                return (
                  <Card key={r.id} className="flex flex-col gap-2 p-4">
                    <p className="text-overline uppercase text-muted">{r.brand}</p>
                    <p className="text-headline">{r.title}</p>
                    <p className="flex-1 text-caption text-muted">{r.description}</p>
                    <p className="tabular text-callout font-semibold">{coins(r.costCoins)} coins</p>
                    <Button size="sm" variant={short > 0 ? 'secondary' : 'primary'} disabled={short > 0} onClick={() => setPick(r)}>
                      {short > 0 ? `${coins(short)} more` : 'Redeem'}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="History" />
            {d.history.length === 0 ? (
              <EmptyState icon="gift" title="No coins yet" body="Pay your card bill on time to start earning." />
            ) : (
              <List>
                {d.history.map((h) => (
                  <ListRow
                    key={h.id}
                    leading={
                      <span className={`grid h-10 w-10 place-items-center rounded-full bg-raised ${h.coins >= 0 ? 'text-positive' : 'text-muted'}`}>
                        <Icon name={h.coins >= 0 ? 'arrowDown' : 'arrowUp'} size={18} />
                      </span>
                    }
                    title={h.description}
                    subtitle={dateTime(h.at)}
                    trailing={
                      <span className={`tabular font-semibold ${h.coins >= 0 ? 'text-positive' : ''}`}>
                        {h.coins >= 0 ? '+' : '−'}
                        {coins(Math.abs(h.coins))}
                      </span>
                    }
                  />
                ))}
              </List>
            )}
          </section>
        </>
      )}

      <Sheet open={!!pick} title={result ? 'Enjoy!' : 'Redeem this reward?'} onClose={close}>
        {pick && !result ? (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-1 p-4">
              <p className="text-overline uppercase text-muted">{pick.brand}</p>
              <p className="text-headline">{pick.title}</p>
              <p className="text-caption text-muted">
                {pick.description} Worth <Money paise={pick.valuePaise} />.
              </p>
            </Card>
            <p className="text-callout">
              Uses <strong className="tabular">{coins(pick.costCoins)}</strong> of your {coins(d?.balance ?? 0)} coins.
            </p>
            {error ? <Notice>{error}</Notice> : null}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button loading={busy} onClick={redeem}>
                Redeem
              </Button>
            </div>
          </div>
        ) : result ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid h-16 w-16 animate-pop place-items-center rounded-full bg-positive/15 text-positive">
              <Icon name="check" size={32} />
            </span>
            <p className="text-callout text-muted">{result.title}</p>
            <p className="rounded-md border border-dashed border-accent px-5 py-3 font-mono text-headline tracking-widest">{result.code}</p>
            <Badge tone="positive">Voucher ready to use</Badge>
            <Button block onClick={close}>
              Done
            </Button>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
}
