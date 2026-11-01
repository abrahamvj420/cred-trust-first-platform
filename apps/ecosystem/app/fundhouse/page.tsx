'use client';

import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { Suspense } from 'react';
import { ecosystem } from '@/lib/api';
import { Panel, Portal, State, usePortal } from '../_portal';

function Fundhouse() {
  const q = usePortal((c) => ecosystem(ecosystemApi.fundhouse.portfolio, { params: { customerRef: c } }));
  const d = q.data;
  const total = d?.holdings.reduce((a, h) => a + h.valuePaise, 0) ?? 0;
  return (
    <Portal brand="Meridian Mutual Fund" tagline="Investor services" path="/fundhouse">
      <State error={q.error} loading={!d} />
      {d ? (
        <>
          <Panel title={`${d.investorName} · current value`}>
            <Money paise={total} className="text-3xl font-semibold" />
          </Panel>
          <Panel title="Folios">
            {d.holdings.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 font-normal">Scheme</th>
                    <th className="py-1 text-right font-normal">Units</th>
                    <th className="py-1 text-right font-normal">NAV</th>
                    <th className="py-1 text-right font-normal">Value</th>
                    <th className="py-1 text-right font-normal">Pledged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.holdings.map((h) => (
                    <tr key={`${h.folio}${h.schemeCode}`}>
                      <td className="py-2">
                        {h.schemeName}
                        <span className="block text-xs text-muted">Folio {h.folio}</span>
                      </td>
                      <td className="py-2 text-right tabular">{h.units.toLocaleString('en-IN')}</td>
                      <td className="py-2 text-right tabular">
                        <Money paise={h.navPaise} exact />
                      </td>
                      <td className="py-2 text-right tabular">
                        <Money paise={h.valuePaise} />
                      </td>
                      <td className={`py-2 text-right tabular ${h.lienUnits ? 'text-warning' : 'text-muted'}`}>{h.lienUnits ? `${h.lienUnits.toLocaleString('en-IN')} units (lien)` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">No folios with Meridian.</p>
            )}
          </Panel>
        </>
      ) : null}
    </Portal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Fundhouse />
    </Suspense>
  );
}
