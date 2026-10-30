import { describe, expect, it } from 'vitest';
import { cardVsEmi } from '../finance';
import type { MemberSnapshot, QuoteInput } from '../snapshot';
import { evaluateBigSpend } from './big-spend';

const base = (over: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
  memberId: 'm',
  today: '2026-11-02',
  card: { limitPaise: 4_00_000_00, outstandingPaise: 2_20_000_00 },
  statements: [
    { periodEnd: '2026-10-15', totalDuePaise: 46_000_00, minDuePaise: 2_300_00, paidPaise: 0, dueDate: '2026-11-05', paymentKind: null, onTime: null },
    ...[9, 8, 7].map((m) => ({ periodEnd: `2026-0${m}-15`, totalDuePaise: 45_000_00, minDuePaise: 2_250_00, paidPaise: 45_000_00, dueDate: `2026-${String(m + 1).padStart(2, '0')}-05`, paymentKind: 'full' as const, onTime: true })),
  ],
  smartSavings: 'granted',
  smartSavingsPrompted: false,
  verifiedMonthlyIncomePaise: null,
  existingEmiPaise: 0,
  ladder: { tier: 'gold', limitPaise: 3_00_000_00 },
  offers: { activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: [], declines: [] },
  helpThisMonth: 0,
  ...over,
});
const laptop = { transactionRef: 't1', merchant: 'ShopKart', amountPaise: 1_50_000_00 };
const quotes: QuoteInput[] = [
  { quoteRef: 'q1', lenderName: 'Northstar Finance', kind: 'purchase_emi', principalPaise: 1_50_000_00, tenureMonths: 12, ratePaBps: 1600, feeBps: 100 },
  { quoteRef: 'q2', lenderName: 'Banyan Credit', kind: 'personal_loan', principalPaise: 1_50_000_00, tenureMonths: 12, ratePaBps: 1800, feeBps: 100 },
];
const decide = (s: MemberSnapshot, t = laptop) => {
  const r = evaluateBigSpend(s, t, quotes);
  if (r.kind !== 'decision') throw new Error('expected decision');
  return r.decision;
};

describe('Big-Spend Support', () => {
  it('asks for quotes only after every pre-check passes', () => {
    expect(evaluateBigSpend(base(), laptop, null)).toEqual({ kind: 'needs_quotes', principalPaise: 1_50_000_00, tenureMonths: 12 });
  });

  it('offers the cheapest option, with saving from the savings method', () => {
    const d = decide(base());
    expect(d.outcome).toBe('offer');
    expect(d.offer!.status).toBe('shown');
    expect(d.offer!.options.map((o) => o.key)).toEqual(['pay_in_full', 'card_revolve', 'emi', 'loan']);
    expect(d.offer!.options.find((o) => o.recommended)!.key).toBe('emi');
    expect(d.netBenefitPaise).toBe(cardVsEmi(1_50_000_00, 12, 1600).savingPaise);
    expect(d.checks.map((c) => c.check)).toEqual(['signal', 'permission', 'stress', 'offer_cap', 'affordability', 'net_benefit']);
  });

  it('first time without Smart Savings: offer waits for the one-time permission', () => {
    const d = decide(base({ smartSavings: 'never' }));
    expect(d.outcome).toBe('offer');
    expect(d.offer!.status).toBe('awaiting_permission');
    expect(d.promptPermission).toBe(true);
  });

  it('never asks twice: already prompted and not granted → blocked', () => {
    const d = decide(base({ smartSavings: 'never', smartSavingsPrompted: true }));
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['no_permission'] });
  });

  it('small purchase: no signal, no offer', () => {
    const d = decide(base(), { ...laptop, amountPaise: 2_000_00 });
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['no_signal'], offer: null });
  });

  it('stressed member gets help, not credit', () => {
    const s = base({
      card: { limitPaise: 2_50_000_00, outstandingPaise: 2_40_000_00 },
      statements: base().statements.map((x, i) => (i === 0 ? x : { ...x, paymentKind: 'minimum' as const, paidPaise: x.minDuePaise })),
    });
    const d = decide(s);
    expect(d.outcome).toBe('help');
    expect(d.reasons).toEqual(['stress_signal']);
    expect(d.stressSignals).toEqual(expect.arrayContaining(['minimum_only_payments', 'high_utilisation']));
    expect(d.offer).toBeNull();
    expect(d.help!.monthlyInterestPaise).toBeGreaterThan(0);
  });

  it('never above affordability: purchase above tier limit is blocked', () => {
    expect(decide(base({ ladder: { tier: 'starter', limitPaise: 50_000_00 } }))).toMatchObject({ outcome: 'blocked', reasons: ['above_affordability'] });
  });

  it('one active offer at a time', () => {
    expect(decide(base({ offers: { activeOfferId: 'o1', proactiveThisMonth: 1, offeredTriggerRefs: [], declines: [] } }))).toMatchObject({ reasons: ['active_offer_exists'] });
  });

  it('a declined offer never reappears and the feature stays quiet', () => {
    const offers = { activeOfferId: null, proactiveThisMonth: 1, offeredTriggerRefs: ['t1'], declines: [{ feature: 'big_spend_support' as const, decidedOn: '2026-11-02' }] };
    expect(decide(base({ offers }))).toMatchObject({ reasons: ['already_offered'] });
    expect(decide(base({ offers }), { ...laptop, transactionRef: 't2' })).toMatchObject({ reasons: ['recently_declined'] });
  });
});
