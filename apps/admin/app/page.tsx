'use client';

import { credApi, type AdminOverview } from '@cred/types';
import { Money } from '@cred/ui';
import { credAdmin } from '@/lib/api';
import { DataTable, DecisionCard, feature, Kpi, Page, pct, Section, Tag, useAdmin } from './_ui';

/** Overview: the offer funnel by feature, member gains, defaults, and the live decision feed. */
export default function Overview() {
  const q = useAdmin(async () => ({ o: await credAdmin(credApi.admin.overview), d: await credAdmin(credApi.admin.decisions, { query: { limit: 8 } }) }));
  const o: AdminOverview | undefined = q.data?.o;
  return (
    <Page title="Overview" subtitle={o ? `Simulated date ${o.simDate} · ${o.members} members` : 'Loading…'} live={q.live}>
      {q.error ? <p className="text-sm text-negative">{q.error}</p> : null}
      {o ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Member gains (measured)" value={<Money paise={o.kpis.memberGainsPaise} />} hint="Savings on accepted offers, early repayment and wellness" tone="positive" />
            <Kpi label="Offers shown → accepted" value={`${o.kpis.offersShown} → ${o.kpis.accepted}`} hint={`${pct(o.kpis.acceptanceRateBps)} accepted`} />
            <Kpi label="Decided not to offer" value={o.kpis.blocked} hint={`${o.kpis.decisions} decisions in all; ${o.kpis.help} got help instead of credit`} />
            <Kpi label="Open complaints" value={o.kpis.openComplaints} tone={o.kpis.openComplaints ? 'warning' : undefined} />
          </div>

          <Section title="Offer funnel by feature">
            <DataTable
              head={['Feature', 'Decisions', 'Offers', 'Awaiting permission', 'Shown', 'Accepted', 'Dismissed', 'Expired', 'Help', 'Available', 'Not offered, by reason']}
              align={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left']}
              rows={o.funnel.map((f) => [
                <span key="f" className="capitalize">
                  {feature(f.feature)}
                </span>,
                f.decisions,
                f.offers,
                f.awaitingPermission,
                f.shown,
                <span key="a" className={f.accepted ? 'text-positive' : ''}>
                  {f.accepted}
                </span>,
                f.dismissed,
                f.expired,
                f.help,
                f.available,
                <span key="b" className="flex flex-wrap gap-1">
                  {f.blocked.length ? f.blocked.map((b) => <Tag key={b.reason}>{`${b.reason} ×${b.count}`}</Tag>) : <span className="text-muted">—</span>}
                </span>,
              ])}
            />
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Member gains">
              <DataTable
                head={['Source', 'Count', 'Gain']}
                align={['left', 'right', 'right']}
                rows={o.gains.map((g) => [<span key="s">{g.source}</span>, g.count, <Money key="m" paise={g.gainPaise} />])}
                empty="No gains yet"
              />
            </Section>
            <Section title="Defaults and strain">
              <DataTable
                head={['Measure', 'Value']}
                align={['left', 'right']}
                rows={[
                  ['Active loans through CRED', o.defaults.activeLoans],
                  ['Loans with an overdue EMI', o.defaults.loansWithOverdue],
                  ['Overdue EMIs', <span key="o">{o.defaults.overdueInstalments} · <Money paise={o.defaults.overduePaise} /></span>],
                  ['Loans 90+ days past due (default)', o.defaults.loansOver90Days],
                  ['Default rate', pct(o.defaults.defaultRateBps)],
                  ['Card bills missed (below minimum or late)', o.defaults.cardBillsMissed],
                  ['Members showing strain (got help, not credit)', o.defaults.membersShowingStrain],
                ]}
              />
            </Section>
          </div>

          <Section title="Latest decisions" action={<a className="text-xs text-accent" href="/decisions">All decisions →</a>}>
            <div className="flex flex-col gap-2">
              {q.data!.d.decisions.map((d) => (
                <DecisionCard key={d.id} d={d} />
              ))}
              {q.data!.d.decisions.length === 0 ? <p className="text-sm text-muted">No decisions yet.</p> : null}
            </div>
          </Section>
        </>
      ) : null}
    </Page>
  );
}
