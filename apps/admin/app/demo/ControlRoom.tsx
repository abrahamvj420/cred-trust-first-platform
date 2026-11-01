'use client';

import { ApiError, call, credApi, DEMO_PERSONAS, ecosystemApi, type MemberAction, type PersonaKey, type Scenario } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useState, type ReactNode } from 'react';
import { CRED_API } from '@/lib/api';

/** The control-room exception (CLAUDE.md): only here may an app call /sim, and only with DEMO_MODE=true. */
const ECO_API = process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL ?? 'http://localhost:4100';

type Trigger =
  | { kind: 'world'; scenario: Scenario; label: string; dealerCover?: 'comprehensive' | 'third_party' }
  | { kind: 'member'; action: MemberAction; label: string }
  | { kind: 'advance'; label: string };

const FEATURES: { title: string; hint: string; triggers: Trigger[] }[] = [
  { title: '1 · Big-Spend Support', hint: 'Best with Aarav (offer), Rohan (help)', triggers: [{ kind: 'world', scenario: 'big_purchase', label: '₹1.5L laptop on the card' }] },
  {
    title: '2 · Wealth-Backed Liquidity',
    hint: 'Sneha',
    triggers: [
      { kind: 'member', action: 'fund_sale', label: 'Start selling a fund' },
      { kind: 'world', scenario: 'market_fall', label: 'Market falls 15%' },
    ],
  },
  { title: '3 · Earned Credit Ladder', hint: 'Priya reaches Gold in 2 months', triggers: [{ kind: 'advance', label: 'Advance a month' }] },
  {
    title: '4 · Family Health + Wellness',
    hint: 'Priya (parents), Aarav (wearable)',
    triggers: [
      { kind: 'member', action: 'add_parents', label: 'Add parents, compare cover' },
      { kind: 'member', action: 'connect_wearable', label: 'Connect health app' },
      { kind: 'world', scenario: 'wearable_sync', label: 'Health app syncs' },
    ],
  },
  { title: '5 · Salary-Verified Credit', hint: 'Aarav', triggers: [{ kind: 'member', action: 'verify_salary', label: 'Verify salary via AA' }] },
  {
    title: '6 · Protection Gap + Claims',
    hint: 'Priya (linked); Aarav (not linked: asked)',
    triggers: [
      { kind: 'member', action: 'link_policies', label: 'Link policies via AA' },
      { kind: 'world', scenario: 'insurer_renewal', label: 'Insurer renewal notice' },
      { kind: 'world', scenario: 'new_vehicle', dealerCover: 'comprehensive', label: 'New car, comprehensive' },
      { kind: 'world', scenario: 'new_vehicle', dealerCover: 'third_party', label: 'New car, third-party only' },
      { kind: 'world', scenario: 'claim_update', label: 'Insurer updates claim' },
    ],
  },
  { title: '7 · Wealth Management', hint: 'Aarav', triggers: [{ kind: 'member', action: 'link_portfolio', label: 'Link portfolio via AA' }] },
  { title: '8 · Card-Balance Switch', hint: 'Kabir (offer), Rohan (help)', triggers: [{ kind: 'member', action: 'partial_bill_payment', label: 'Pay part of the bill' }] },
];

export function ControlRoom() {
  const [persona, setPersona] = useState<PersonaKey>('aarav');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: string; text: string; ok: boolean }[]>([]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    try {
      const note = await fn();
      setLog((l) => [{ at: new Date().toLocaleTimeString('en-IN'), text: `${label}: ${note}`, ok: true }, ...l].slice(0, 30));
    } catch (e) {
      setLog((l) => [{ at: new Date().toLocaleTimeString('en-IN'), text: `${label}: ${e instanceof ApiError ? e.message : 'failed'}`, ok: false }, ...l].slice(0, 30));
    }
    setBusy(null);
  }

  const fire = (t: Trigger) =>
    run(`${t.label} (${persona})`, async () => {
      if (t.kind === 'world') return (await call(ECO_API, ecosystemApi.sim.scenario, { body: { scenario: t.scenario, personaKey: persona, dealerCover: t.dealerCover ?? 'comprehensive' } })).note;
      if (t.kind === 'member') return (await call(CRED_API, credApi.platform.simMemberAction, { body: { action: t.action, personaKey: persona } })).note;
      const r = await call(ECO_API, ecosystemApi.sim.advance, { body: { months: 1 } });
      return `${r.from} → ${r.to}, ${r.eventsEmitted} events`;
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <Surface className="flex flex-wrap items-center gap-4 p-4">
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="mb-2 w-full text-xs text-muted">Persona (scenarios act on them; Show on phone switches the CRED app)</legend>
            {DEMO_PERSONAS.map((p) => (
              <label key={p.key} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-calm ${persona === p.key ? 'border-accent bg-raised' : 'border-border hover:border-muted'}`}>
                <input type="radio" name="persona" className="sr-only" checked={persona === p.key} onChange={() => setPersona(p.key)} />
                {p.name.split(' ')[0]}
              </label>
            ))}
          </fieldset>
          <Button size="sm" variant="secondary" loading={busy === 'switch'} onClick={() => run(`Show ${persona} on phone`, async () => (await call(CRED_API, credApi.platform.simSwitchPersona, { body: { personaKey: persona } }), 'the CRED app switched'))}>
            Show on phone
          </Button>
        </Surface>

        <div className="grid gap-3 lg:grid-cols-2">
          {FEATURES.map((f) => (
            <Surface key={f.title} className="flex flex-col gap-3 p-4">
              <div>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="text-xs text-muted">{f.hint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {f.triggers.map((t) => (
                  <Button key={t.label} size="sm" variant="secondary" disabled={!!busy} loading={busy?.startsWith(t.label) ?? false} onClick={() => fire(t)}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </Surface>
          ))}
        </div>

        <Surface className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">Reset demo</h3>
            <p className="text-xs text-muted">Same as pnpm seed: every persona, the clock and rule settings back to the start.</p>
          </div>
          <Button
            size="sm"
            loading={busy === 'Reset demo'}
            disabled={!!busy}
            onClick={() =>
              run('Reset demo', async () => {
                await call(ECO_API, ecosystemApi.sim.reset);
                await call(CRED_API, credApi.platform.simReset);
                return 'both worlds reset to 2 Nov 2026';
              })
            }
          >
            Reset demo
          </Button>
        </Surface>
      </div>

      <Surface className="flex h-fit flex-col gap-2 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">What you fired</h3>
        {log.length ? (
          <ol className="flex flex-col gap-2 text-xs">
            {log.map((l, i) => (
              <li key={i} className={l.ok ? '' : 'text-negative'}>
                <span className="font-mono text-muted">{l.at}</span> {l.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted">Nothing yet. Pick a persona and fire a trigger; watch the phone and the Overview update live.</p>
        )}
      </Surface>
    </div>
  );
}

export function DemoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}
