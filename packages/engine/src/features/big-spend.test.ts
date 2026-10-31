import { describe, expect, it } from 'vitest';
import { cardVsEmi } from '../finance';
import { DEFAULT_RULES } from '../rules';
import type { MemberSnapshot, QuoteInput } from '../snapshot';
import { fullPayer, laptop, quotesFor, stressed } from '../test/fixtures';
import { BANNED_MEMBER_WORDS, memberFacingStrings } from '../member-copy';
import { assessCarry, evaluateBigSpend, type EvaluateOptions } from './big-spend';

const decide = (s: MemberSnapshot, t = laptop, opts: EvaluateOptions = {}, quotes?: QuoteInput[]) => {
  const first = evaluateBigSpend(s, t, null, opts);
  const r = first.kind === 'needs_quotes' ? evaluateBigSpend(s, t, quotes ?? quotesFor(t.amountPaise), opts) : first;
  if (r.kind !== 'decision') throw new Error('engine asked for quotes twice');
  return r.decision;
};
const lastCheck = (d: ReturnType<typeof decide>) => d.checks.at(-1)!;

describe('Big-Spend Support: offer path', () => {
  it('asks for quotes only after every pre-check passes', () => {
    expect(evaluateBigSpend(fullPayer(), laptop, null)).toEqual({ kind: 'needs_quotes', principalPaise: 1_50_000_00, tenureMonths: 12 });
  });

  it('offers the cheapest option with the saving from the savings method, every check in order', () => {
    const d = decide(fullPayer());
    expect(d.outcome).toBe('offer');
    expect(d.checks.map((c) => c.check)).toEqual(['signal', 'permission', 'stress', 'offer_cap', 'affordability', 'likely_to_carry', 'net_benefit']);
    expect(d.netBenefitPaise).toBe(cardVsEmi(1_50_000_00, 12, 1600).savingPaise);
    expect(d.offer!.options[0]!.key).toBe('pay_in_full');
    expect(d.offer!.options.find((o) => o.recommended)!.key).toBe('emi');
  });

  it('headline is conditional, never an unconditional saving claim', () => {
    const d = decide(fullPayer());
    expect(d.offer!.headline).toBe(`If you can’t clear ₹1,50,000 by the due date, an EMI saves you ₹27,714 compared with carrying it`);
    expect(d.offer!.subline).toMatch(/Paying the full bill is still cheapest/);
  });
});

describe('Rule: permission', () => {
  it('no proactive offer is shown without Smart Savings: never asked → saved as awaiting permission, asked once', () => {
    const d = decide(fullPayer({ smartSavings: 'never' }));
    expect(d.offer!.status).toBe('awaiting_permission');
    expect(d.promptPermission).toBe(true);
    expect(d.explanation).toMatch(/only show it if you turn on Smart Savings/);
  });

  it('withdrawn → blocked: no_permission, explained', () => {
    const d = decide(fullPayer({ smartSavings: 'withdrawn' }));
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['no_permission'], offer: null });
    expect(d.explanation).toBe('Smart Savings is off, so we’re not looking for savings for you. You can turn it on any time in Permissions.');
  });

  it('"Not now" is not re-asked for 90 days, then asked again', () => {
    const asked = (daysAgo: number) => fullPayer({ smartSavings: 'never', smartSavingsLastAskedOn: new Date(Date.parse('2026-11-02') - daysAgo * 86_400_000).toISOString().slice(0, 10) });
    expect(decide(asked(10))).toMatchObject({ outcome: 'blocked', reasons: ['no_permission'] });
    expect(decide(asked(89))).toMatchObject({ reasons: ['no_permission'] });
    expect(decide(asked(90)).offer!.status).toBe('awaiting_permission');
  });

  it('member-initiated requests need no permission', () => {
    const d = decide(fullPayer({ smartSavings: 'withdrawn' }), laptop, { origin: 'member_initiated' });
    expect(d.offer!.status).toBe('shown');
  });
});

describe('Rule: stress → help, not credit', () => {
  it('blocks with stress_signal and creates repayment help', () => {
    const d = decide(stressed());
    expect(d).toMatchObject({ outcome: 'help', reasons: ['stress_signal'], offer: null });
    expect(d.stressSignals).toEqual(expect.arrayContaining(['minimum_only_payments', 'high_utilisation']));
    expect(d.help!.monthlyInterestPaise).toBeGreaterThan(0);
    expect(d.explanation).toBe('We’ll hold off on new credit while you clear your current balance. Here’s a plan that could help.');
  });

  it('applies even when the member asks', () => {
    expect(decide(stressed(), laptop, { origin: 'member_initiated' }).outcome).toBe('help');
  });

  it('help is created at most once a month', () => {
    expect(decide(stressed({ helpThisMonth: 1 })).help).toBeNull();
  });
});

describe('Rule: affordability', () => {
  it('above the ladder tier limit → above_affordability', () => {
    expect(decide(fullPayer({ ladder: { tier: 'starter', limitPaise: 50_000_00 } }))).toMatchObject({ outcome: 'blocked', reasons: ['above_affordability'] });
  });

  it('EMIs above 40% of verified income → above_affordability', () => {
    const d = decide(fullPayer({ verifiedMonthlyIncomePaise: 40_000_00, existingEmiPaise: 5_000_00 }));
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['above_affordability'] });
    expect(d.explanation).toBe('This would stretch your monthly budget, so we’re not suggesting a loan.');
  });

  it('quotes that break affordability are dropped, never offered', () => {
    // ₹35,000 income → cap ₹14,000; 16% EMI ≈ ₹13,610 fits; a 60% quote would not.
    const s = fullPayer({ verifiedMonthlyIncomePaise: 35_000_00, statements: fullPayer().statements.map((x, i) => (i === 0 ? x : { ...x, paidPaise: 30_000_00, totalDuePaise: 30_000_00 })) });
    const d = decide(s, laptop, {}, [quotesFor(laptop.amountPaise)[0]!, { ...quotesFor(laptop.amountPaise)[1]!, ratePaBps: 6000 }]);
    expect(d.outcome).toBe('offer');
    expect(d.offer!.options.map((o) => o.key)).toEqual(['pay_in_full', 'card_revolve', 'emi']);
  });
});

describe('Rule: likely to carry', () => {
  it('Aarav-like full payer buying ₹1.5L is likely to carry (bill far above typical repayment)', () => {
    const c = assessCarry(fullPayer());
    expect(c.likelyToCarry).toBe(true);
    expect(c.typicalRepaymentPaise).toBe(45_000_00);
  });

  it('a full payer who can clear the bill gets no proactive offer: can_pay_in_full', () => {
    // Next bill ≈ ₹25,000 unbilled + ₹38,500 = ₹63,500 < 1.5 × ₹45,000
    const s = fullPayer({ card: { limitPaise: 4_00_000_00, outstandingPaise: 46_000_00 + 25_000_00 + 38_500_00 } });
    const d = decide(s, { transactionRef: 't2', merchant: 'ShopKart', amountPaise: 38_500_00 });
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['can_pay_in_full'], offer: null });
    expect(lastCheck(d).check).toBe('likely_to_carry');
    expect(d.explanation).toMatch(/^Looks like you’ll clear this by the due date, so there’s nothing to save\./);
  });

  it('shared salary with room to spare → can pay in full, even for a big purchase', () => {
    const d = decide(fullPayer({ verifiedMonthlyIncomePaise: 2_10_000_00 }));
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['can_pay_in_full'] });
  });

  it('the threshold is a rule setting', () => {
    const d = decide(fullPayer(), laptop, { rules: { ...DEFAULT_RULES, carryRepaymentMultipleBps: 50_000 } });
    expect(d.reasons).toEqual(['can_pay_in_full']);
  });

  it('member-initiated skips it: the member already decided', () => {
    const s = fullPayer({ card: { limitPaise: 4_00_000_00, outstandingPaise: 1_09_500_00 } });
    const d = decide(s, { transactionRef: 't2', merchant: 'ShopKart', amountPaise: 38_500_00 }, { origin: 'member_initiated' });
    expect(d.outcome).toBe('offer');
    expect(d.checks.find((c) => c.check === 'likely_to_carry')!.detail).toMatch(/Skipped/);
  });
});

describe('Rule: net benefit', () => {
  it('no option cheaper than the card → no_net_benefit', () => {
    const d = decide(fullPayer(), laptop, {}, quotesFor(laptop.amountPaise, 9000, 9500));
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['no_net_benefit'], offer: null });
  });

  it('no partner quotes → not eligible, no offer', () => {
    expect(decide(fullPayer(), laptop, {}, [])).toMatchObject({ outcome: 'blocked', reasons: ['not_eligible'] });
  });
});

describe('Rule: offer control', () => {
  const offers = (o: Partial<MemberSnapshot['offers']>) => ({ activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: [], declines: [], ...o });

  it('one active offer per member, across features and origins', () => {
    expect(decide(fullPayer({ offers: offers({ activeOfferId: 'other-feature-offer' }) })).reasons).toEqual(['active_offer_exists']);
    expect(decide(fullPayer({ offers: offers({ activeOfferId: 'x' }) }), laptop, { origin: 'member_initiated' }).reasons).toEqual(['active_offer_exists']);
  });

  it('monthly cap is a rule setting and applies to proactive offers only', () => {
    const s = fullPayer({ offers: offers({ proactiveThisMonth: 1 }) });
    const rules = { ...DEFAULT_RULES, monthlyProactiveOfferCap: 1 };
    expect(decide(s, laptop, { rules }).reasons).toEqual(['monthly_cap_reached']);
    expect(decide(s, laptop, { rules, origin: 'member_initiated' }).outcome).toBe('offer');
  });

  it('a dismissed offer never returns, and the feature stays quiet for the cooldown', () => {
    const s = fullPayer({ offers: offers({ offeredTriggerRefs: ['t1'], declines: [{ feature: 'big_spend_support', decidedOn: '2026-10-20' }] }) });
    expect(decide(s).reasons).toEqual(['already_offered']);
    expect(decide(s, { ...laptop, transactionRef: 't2' }).reasons).toEqual(['recently_declined']);
    // 31 days after the decline the feature may speak again (for a new purchase)
    const older = fullPayer({ offers: offers({ offeredTriggerRefs: ['t1'], declines: [{ feature: 'big_spend_support', decidedOn: '2026-10-02' }] }) });
    expect(decide(older, { ...laptop, transactionRef: 't3' }).outcome).toBe('offer');
  });

  it('small purchase: no signal', () => {
    expect(decide(fullPayer(), { ...laptop, amountPaise: 2_000_00 })).toMatchObject({ outcome: 'blocked', reasons: ['no_signal'] });
  });
});

describe('Explainability', () => {
  const cases: [string, ReturnType<typeof decide>][] = [
    ['offer', decide(fullPayer())],
    ['awaiting permission', decide(fullPayer({ smartSavings: 'never' }))],
    ['member asked', decide(fullPayer(), laptop, { origin: 'member_initiated' })],
    ['no signal', decide(fullPayer(), { ...laptop, amountPaise: 2_000_00 })],
    ['withdrawn', decide(fullPayer({ smartSavings: 'withdrawn' }))],
    ['stress', decide(stressed())],
    ['affordability', decide(fullPayer({ ladder: { tier: 'starter', limitPaise: 50_000_00 } }))],
    ['can pay in full', decide(fullPayer({ verifiedMonthlyIncomePaise: 2_10_000_00 }))],
    ['net benefit', decide(fullPayer(), laptop, {}, quotesFor(laptop.amountPaise, 9000, 9500))],
  ];
  const more: [string, ReturnType<typeof decide>][] = [
    ['re-ask wait', decide(fullPayer({ smartSavings: 'never', smartSavingsLastAskedOn: '2026-10-20' }))],
    ['one at a time', decide(fullPayer({ offers: { activeOfferId: 'x', proactiveThisMonth: 0, offeredTriggerRefs: [], declines: [] } }))],
    ['monthly cap', decide(fullPayer({ offers: { activeOfferId: null, proactiveThisMonth: 3, offeredTriggerRefs: [], declines: [] } }))],
    ['cooldown', decide(fullPayer({ offers: { activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: [], declines: [{ feature: 'big_spend_support', decidedOn: '2026-10-25' }] } }))],
    ['already offered', decide(fullPayer({ offers: { activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: ['t1'], declines: [] } }))],
    ['income cap', decide(fullPayer({ verifiedMonthlyIncomePaise: 40_000_00 }))],
    ['member below minimum', decide(fullPayer(), { ...laptop, amountPaise: 1_000_00 }, { origin: 'member_initiated' })],
    ['no quotes', decide(fullPayer(), laptop, {}, [])],
    ['member stressed', decide(stressed(), laptop, { origin: 'member_initiated' })],
  ];
  for (const [name, d] of [...cases, ...more]) {
    it(`${name}: has a plain-English why`, () => {
      expect(d.explanation.length).toBeGreaterThan(30);
      expect(d.explanation).not.toMatch(/_|bps|undefined|NaN/);
    });
    it(`${name}: no member-facing string says stress, risk or blocked`, () => {
      for (const text of memberFacingStrings(d)) expect(text).not.toMatch(BANNED_MEMBER_WORDS);
    });
  }
});
