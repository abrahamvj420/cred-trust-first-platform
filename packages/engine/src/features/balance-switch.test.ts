import { describe, expect, it } from 'vitest';
import { cardCost, emiCost } from '../finance';
import { BANNED_MEMBER_WORDS, memberFacingStrings } from '../member-copy';
import type { QuoteInput } from '../snapshot';
import { fullPayer, stressed } from '../test/fixtures';
import { evaluateBalanceSwitch, stepDownBonusPaise } from './balance-switch';

const remaining = 34_000_00;
const trigger = { statementRef: 'st1', remainingPaise: remaining, paidPaise: 30_000_00 };
const switchQuote = (amount = remaining, rate = 1700): QuoteInput => ({
  quoteRef: 'qs',
  lenderName: 'Northstar Finance',
  kind: 'balance_switch_emi',
  principalPaise: amount,
  tenureMonths: 6,
  ratePaBps: rate,
  feeBps: 100,
  rateStepDown: [
    { afterOnTimePayments: 2, ratePaBps: 1600 },
    { afterOnTimePayments: 4, ratePaBps: 1500 },
  ],
});
/** Kabir after paying part of this bill: one part payment in the last three, healthy otherwise. */
const kabir = (over = {}) => {
  const base = fullPayer({ card: { limitPaise: 1_50_000_00, outstandingPaise: remaining }, ladder: { tier: 'starter', limitPaise: 50_000_00 } });
  return fullPayer({
    ...base,
    statements: base.statements.map((x, i) => (i === 0 ? { ...x, totalDuePaise: 64_000_00, paidPaise: 30_000_00, paymentKind: 'custom' as const, onTime: true } : x)),
    ...over,
  });
};

describe('Card-Balance Switch', () => {
  it('a part payment leaving a balance gets the switch offer, measured with the savings method', () => {
    const s = kabir();
    expect(evaluateBalanceSwitch(s, trigger, null)).toMatchObject({ kind: 'needs_quotes', principalPaise: remaining, tenureMonths: 6 });
    const r = evaluateBalanceSwitch(s, trigger, [switchQuote()]);
    if (r.kind !== 'decision') throw new Error('expected decision');
    const d = r.decision;
    expect(d.outcome).toBe('offer');
    const expected = cardCost(remaining, 6).totalCostPaise - emiCost(remaining, 6, 1700).totalCostPaise;
    expect(d.netBenefitPaise).toBe(expected);
    expect(d.offer!.options.map((o) => o.key)).toEqual(['pay_in_full', 'card_revolve', 'emi']);
    expect(d.offer!.options[0]).toMatchObject({ totalCostPaise: 0 });
    expect(d.offer!.headline).toMatch(/^If you carry the remaining ₹34,000/);
    expect(d.checks.map((c) => c.check)).toEqual(['signal', 'permission', 'stress', 'offer_cap', 'affordability', 'likely_to_carry', 'net_benefit']);
    expect(d.offer!.terms).toMatchObject({ kind: 'loan', loanKind: 'balance_switch_emi', rateStepDown: switchQuote().rateStepDown });
    for (const t of memberFacingStrings(d)) expect(t).not.toMatch(BANNED_MEMBER_WORDS);
  });

  it('the step-down saving is shown on top, never counted in the headline saving', () => {
    const bonus = stepDownBonusPaise(remaining, 6, switchQuote());
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThan(emiCost(remaining, 6, 1700).interestPaise);
    const r = evaluateBalanceSwitch(kabir(), trigger, [switchQuote()]);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.offer!.options[2]!.note).toMatch(/not counted in the saving above/);
  });

  it('a pattern of part payments is a signal of strain: help, not a switch', () => {
    const r = evaluateBalanceSwitch(stressed(), trigger, [switchQuote()]);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.outcome).toBe('help');
    expect(r.decision.offer).toBeNull();
  });

  it('small balances are not worth switching; the same bill is never offered twice', () => {
    const small = evaluateBalanceSwitch(kabir(), { ...trigger, remainingPaise: 4_000_00 }, null);
    if (small.kind !== 'decision') throw new Error();
    expect(small.decision.reasons).toEqual(['no_signal']);
    const again = evaluateBalanceSwitch(kabir({ offers: { activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: ['st1'], declines: [] } }), trigger, null);
    if (again.kind !== 'decision') throw new Error();
    expect(again.decision.reasons).toEqual(['already_offered']);
  });

  it('needs Smart Savings (proactive); never asked → saved awaiting permission', () => {
    const off = evaluateBalanceSwitch(kabir({ smartSavings: 'withdrawn' }), trigger, null);
    if (off.kind !== 'decision') throw new Error();
    expect(off.decision.reasons).toEqual(['no_permission']);
    const never = evaluateBalanceSwitch(kabir({ smartSavings: 'never' }), trigger, [switchQuote()]);
    if (never.kind !== 'decision') throw new Error();
    expect(never.decision.offer!.status).toBe('awaiting_permission');
  });

  it('above the credit limit or the income cap: no switch', () => {
    const r = evaluateBalanceSwitch(kabir({ ladder: { tier: 'starter', limitPaise: 20_000_00 } }), trigger, null);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.reasons).toEqual(['above_affordability']);
    const income = evaluateBalanceSwitch(kabir({ verifiedMonthlyIncomePaise: 20_000_00, existingEmiPaise: 5_000_00 }), trigger, null);
    if (income.kind !== 'decision') throw new Error();
    expect(income.decision.reasons).toEqual(['above_affordability']);
  });
});
