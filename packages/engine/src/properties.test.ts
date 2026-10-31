import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TriggerOrigin } from '@cred/types';
import { stressSignals } from './checks/stress';
import { LADDER_TIERS } from './constants';
import { evaluateBigSpend } from './features/big-spend';
import { emiCost } from './finance';
import { DEFAULT_RULES } from './rules';
import type { MemberSnapshot, QuoteInput } from './snapshot';

const rupees = (min: number, max: number) => fc.integer({ min: min * 100, max: max * 100 });
const date = fc.integer({ min: -200, max: 0 }).map((d) => new Date(Date.parse('2026-11-02') + d * 86_400_000).toISOString().slice(0, 10));

const statement = fc.record({
  totalDuePaise: rupees(0, 6_00_000),
  kind: fc.constantFrom('full', 'minimum', 'custom'),
  share: fc.integer({ min: 1, max: 99 }),
  onTime: fc.boolean(),
});

const snapshot: fc.Arbitrary<MemberSnapshot> = fc
  .record({
    limit: rupees(20_000, 10_00_000),
    utilisation: fc.integer({ min: 0, max: 110 }),
    openTotal: rupees(0, 3_00_000),
    settled: fc.array(statement, { maxLength: 7 }),
    smartSavings: fc.constantFrom('granted', 'withdrawn', 'never'),
    lastAsked: fc.option(date),
    income: fc.option(rupees(15_000, 6_00_000)),
    existingEmi: rupees(0, 1_00_000),
    tier: fc.constantFrom(...LADDER_TIERS),
    active: fc.option(fc.constant('o1')),
    proactiveThisMonth: fc.integer({ min: 0, max: 5 }),
    declined: fc.option(date),
    help: fc.integer({ min: 0, max: 1 }),
  })
  .map((r) => ({
    memberId: 'm',
    today: '2026-11-02',
    card: { limitPaise: r.limit, outstandingPaise: Math.round((r.limit * r.utilisation) / 100) },
    statements: [
      { periodEnd: '2026-10-15', totalDuePaise: r.openTotal, minDuePaise: Math.round(r.openTotal / 20), paidPaise: 0, dueDate: '2026-11-05', paymentKind: null, onTime: null },
      ...r.settled.map((x, i) => {
        const min = Math.round(x.totalDuePaise / 20);
        const paid = x.kind === 'full' ? x.totalDuePaise : x.kind === 'minimum' ? min : Math.round((x.totalDuePaise * x.share) / 100);
        return { periodEnd: `2026-${String(9 - i).padStart(2, '0')}-15`, totalDuePaise: x.totalDuePaise, minDuePaise: min, paidPaise: paid, dueDate: `2026-${String(10 - i).padStart(2, '0')}-05`, paymentKind: x.kind, onTime: x.onTime };
      }),
    ],
    smartSavings: r.smartSavings,
    smartSavingsLastAskedOn: r.lastAsked,
    verifiedMonthlyIncomePaise: r.income,
    existingEmiPaise: r.existingEmi,
    ladder: { tier: r.tier.tier, limitPaise: r.tier.limitPaise },
    offers: { activeOfferId: r.active, proactiveThisMonth: r.proactiveThisMonth, offeredTriggerRefs: [], declines: r.declined ? [{ feature: 'big_spend_support' as const, decidedOn: r.declined }] : [] },
    helpThisMonth: r.help,
  }));

const quotes = (amount: number) =>
  fc.array(
    fc.record({
      kind: fc.constantFrom('purchase_emi' as const, 'personal_loan' as const),
      ratePaBps: fc.integer({ min: 0, max: 9000 }),
      feeBps: fc.integer({ min: 0, max: 500 }),
      mismatch: fc.integer({ min: 0, max: 9 }),
    }),
    { maxLength: 3 },
  ).map((qs) =>
    qs.map(
      (q, i): QuoteInput => ({
        quoteRef: `q${i}`,
        lenderName: 'Lender',
        kind: q.kind,
        principalPaise: q.mismatch === 0 ? amount + 100 : amount, // occasionally a lender quotes the wrong amount
        tenureMonths: 12,
        ratePaBps: q.ratePaBps,
        feeBps: q.feeBps,
      }),
    ),
  );

const scenario = fc
  .record({ s: snapshot, amount: rupees(1_000, 10_00_000), origin: fc.constantFrom<TriggerOrigin>('proactive', 'member_initiated') })
  .chain((x) => quotes(x.amount).map((q) => ({ ...x, quotes: q })));

function run({ s, amount, origin, quotes }: { s: MemberSnapshot; amount: number; origin: TriggerOrigin; quotes: QuoteInput[] }) {
  const trigger = { transactionRef: 't', merchant: 'ShopKart', amountPaise: amount };
  let r = evaluateBigSpend(s, trigger, null, { origin });
  if (r.kind === 'needs_quotes') r = evaluateBigSpend(s, trigger, quotes, { origin });
  if (r.kind !== 'decision') throw new Error('asked for quotes twice');
  return r.decision;
}

const RUNS = { numRuns: 3000 };

describe('engine properties (fast-check)', () => {
  it('no offer is ever shown with a non-positive saving', () => {
    fc.assert(
      fc.property(scenario, (x) => {
        const d = run(x);
        if (!d.offer) return;
        expect(d.offer.netBenefitPaise).toBeGreaterThan(0);
        expect(d.offer.comparison.netBenefitPaise).toBe(d.offer.netBenefitPaise);
        const card = d.offer.options.find((o) => o.key === 'card_revolve')!;
        expect(d.offer.options.find((o) => o.recommended)!.totalCostPaise).toBeLessThan(card.totalCostPaise);
      }),
      RUNS,
    );
  });

  it('no credit offer ever goes to a stressed member', () => {
    fc.assert(
      fc.property(scenario, (x) => {
        if (!stressSignals(x.s).length) return;
        const d = run(x);
        expect(d.offer).toBeNull();
        expect(['help', 'blocked']).toContain(d.outcome);
      }),
      RUNS,
    );
  });

  it('no offer ever exceeds affordability', () => {
    fc.assert(
      fc.property(scenario, (x) => {
        const d = run(x);
        if (!d.offer) return;
        const cap = x.s.verifiedMonthlyIncomePaise === null ? null : Math.round((x.s.verifiedMonthlyIncomePaise * DEFAULT_RULES.maxEmiToIncomeBps) / 10_000);
        for (const o of d.offer.options.filter((o) => o.acceptable)) {
          const t = o.terms!;
          expect(t.principalPaise).toBeLessThanOrEqual(x.s.ladder.limitPaise);
          expect(t.principalPaise).toBe(x.amount);
          expect(t.emiPaise).toBe(emiCost(t.principalPaise, t.tenureMonths, t.ratePaBps, o.lines.find((l) => l.kind === 'fee') ? Math.round((t.processingFeePaise * 10_000) / t.principalPaise) : 0).emiPaise);
          if (cap !== null) expect(t.emiPaise + x.s.existingEmiPaise).toBeLessThanOrEqual(cap);
        }
      }),
      RUNS,
    );
  });

  it('a proactive offer is never shown without Smart Savings, and never to someone likely to pay in full', () => {
    fc.assert(
      fc.property(scenario, (x) => {
        const d = run(x);
        if (!d.offer || x.origin !== 'proactive') return;
        if (x.s.smartSavings !== 'granted') expect(d.offer.status).toBe('awaiting_permission');
        expect(d.checks.find((c) => c.check === 'likely_to_carry')!.passed).toBe(true);
        expect(d.offer.headline).toMatch(/^If you can’t clear/);
      }),
      RUNS,
    );
  });

  it('every decision is explained, and a block names exactly the check that stopped it', () => {
    fc.assert(
      fc.property(scenario, (x) => {
        const d = run(x);
        expect(d.explanation.length).toBeGreaterThan(20);
        if (d.outcome === 'blocked') {
          const last = d.checks.at(-1)!;
          expect(last.passed).toBe(false);
          expect(d.reasons).toEqual([last.reason]);
        }
      }),
      RUNS,
    );
  });
});
