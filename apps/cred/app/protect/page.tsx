'use client';

import { credApi, type GapArea } from '@cred/types';
import { Avatar, Badge, Button, ButtonLink, Card, ErrorState, Icon, List, ListRow, LoadingScreen, Money, Notice, ProgressBar, SectionHeader } from '@cred/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { lakhs, shortDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Why } from '../_components/Cards';
import { Screen } from '../_shell/Screen';

function Area({ a }: { a: GapArea }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-headline">
          <Icon name={a.area === 'motor' ? 'car' : 'heart'} size={18} className="text-accent" />
          {a.title}
        </span>
        {a.covered ? <Badge tone="positive">Covered</Badge> : <Badge tone="warning">{a.area === 'motor' ? 'Own damage not covered' : `${lakhs(a.gapPaise)} short`}</Badge>}
      </div>
      {a.area === 'health' ? (
        <>
          <ProgressBar value={a.needPaise ? a.existingPaise / a.needPaise : 1} label={`${lakhs(a.existingPaise)} of ${lakhs(a.needPaise)} suggested`} warnAt={2} alertAt={2} />
          <p className="text-caption text-muted">
            {lakhs(a.existingPaise)} held of {lakhs(a.needPaise)} suggested{a.employerPaise ? `, ${lakhs(a.employerPaise)} from your employer` : ''}
          </p>
        </>
      ) : null}
      <ul className="flex flex-col gap-1 text-caption text-muted">
        {a.rationale.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/** Protect: what cover you hold (employer cover included), whether it fits, family, wellness and claims. */
function Protect() {
  const issued = useSearchParams().get('issued');
  const policies = useApi(credApi.products.policies);
  const gap = useApi(credApi.products.protectionGap);
  const family = useApi(credApi.products.family);
  const wellness = useApi(credApi.products.wellness);
  const claims = useApi(credApi.products.claims);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.checkProtectionGap);
      gap.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  const g = gap.data;
  return (
    <Screen title="Protect" back="/">
      {policies.error && !policies.data ? (
        <ErrorState message={policies.error} onRetry={policies.reload} />
      ) : !policies.data || !g ? (
        <LoadingScreen label="Loading your cover" />
      ) : (
        <>
          {issued ? <Notice tone="positive">Done. Your policy is being issued; it appears below as soon as the insurer confirms.</Notice> : null}

          <section className="flex flex-col gap-3" aria-label="Does your cover fit">
            <SectionHeader title="Does your cover fit?" />
            <Card elevation={2} className="flex flex-col gap-4">
              {!g.linked ? (
                <>
                  <p className="text-callout">We can check your cover for gaps, counting cover from your employer, once your policies are linked.</p>
                  <ButtonLink href="/protect/link">Link your policies</ButtonLink>
                </>
              ) : (
                <>
                  {g.areas.map((a) => (
                    <Area key={a.title} a={a} />
                  ))}
                  <Why text={g.explanation} label="What we found" />
                  {g.offerId ? (
                    <ButtonLink href={`/offers/${g.offerId}`}>See the cheapest way to close it</ButtonLink>
                  ) : (
                    <Button variant="secondary" loading={busy} onClick={check}>
                      Check my cover now
                    </Button>
                  )}
                  <p className="text-caption text-muted">Checked {shortDate(g.checkedOn)}. We suggest the right cover, not the most: nothing, if you’re covered.</p>
                </>
              )}
              {error ? <Notice>{error}</Notice> : null}
            </Card>
          </section>

          <section className="flex flex-col gap-3" aria-label="Your policies">
            <SectionHeader title="Your policies" />
            {policies.data.policies.length ? (
              <List>
                {policies.data.policies.map((p) => (
                  <ListRow
                    key={p.id}
                    leading={<Avatar icon={p.vehicle ? 'car' : 'shield'} />}
                    title={p.productName}
                    subtitle={
                      p.isEmployer
                        ? `From ${p.employerName ?? 'your employer'} · ends if you change jobs`
                        : p.vehicle
                          ? `${p.vehicle.registration}${p.kind === 'motor_third_party' ? ' · third-party only' : ''}`
                          : `${p.source === 'cred_purchase' ? 'Bought via CRED' : p.insurerName}${p.renewalDate ? ` · renews ${shortDate(p.renewalDate)}` : ''}`
                    }
                    trailing={<span className="text-callout tabular">{p.vehicle ? <Money paise={p.annualPremiumPaise} /> : lakhs(p.coverPaise)}</span>}
                  />
                ))}
              </List>
            ) : (
              <Card className="text-callout text-muted">No policies yet. Policies you link or buy through CRED show up here.</Card>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-label="More">
            <List>
              <ListRow href="/protect/family" leading={<Avatar icon="users" />} title="Family" subtitle={family.data ? `${family.data.family.length ? `${family.data.family.length} added` : 'Add the people you’d like to cover'} · compare cover` : 'Loading'} />
              <ListRow
                href="/protect/wellness"
                leading={<Avatar icon="heart" />}
                title="Wellness rewards"
                subtitle={wellness.data?.linked ? `Score ${wellness.data.averageScore ?? '–'} · ` + (wellness.data.rewardEarnedPaise ? `₹${Math.round(wellness.data.rewardEarnedPaise / 100).toLocaleString('en-IN')} off at renewal` : 'keep moving to earn a reward') : 'Earn up to 10% off your floater premium'}
              />
              <ListRow
                href="/protect/claims"
                leading={<Avatar icon="doc" />}
                title="Claims"
                subtitle={claims.data?.claims.length ? `${claims.data.claims.filter((c) => c.status !== 'settled' && c.status !== 'rejected').length} in progress` : 'We file and follow up for you'}
              />
            </List>
          </section>
        </>
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Protect />
    </Suspense>
  );
}
