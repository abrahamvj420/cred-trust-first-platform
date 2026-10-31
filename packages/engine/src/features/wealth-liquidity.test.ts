import { describe, expect, it } from 'vitest';
import { BANNED_MEMBER_WORDS, memberFacingStrings } from '../member-copy';
import { fullPayer, stressed } from '../test/fixtures';
import type { QuoteInput } from '../snapshot';
import { evaluateSellVsBorrow, lostReturnPaise, maxBorrowPaise, saleTax, sellVsBorrowCosts, type HoldingInput } from './wealth-liquidity';

/** Aarav's flexi-cap fund: ₹4.1L, bought for ₹3.2L in 2023. */
const fund: HoldingInput = { id: 'h1', name: 'Meridian Flexi Cap Fund', kind: 'mutual_fund', assetClass: 'equity', valuePaise: 4_10_000_00, costPaise: 3_20_000_00, acquiredAt: '2023-06-12', expectedReturnBps: 1200, pledgedPaise: 0 };
const quote = (amount: number, months = 12, rate = 1050): QuoteInput => ({ quoteRef: 'q', lenderName: 'Keystone Capital', kind: 'loan_against_funds', principalPaise: amount, tenureMonths: months, ratePaBps: rate, feeBps: 50 });
const req = (amountPaise: number, holding = fund, months = 12) => ({ holding, amountPaise, months });

describe('sale costs', () => {
  it('long-term equity gains: the yearly exemption first, then 12.5%', () => {
    // Selling ₹2L: gain share 90/410 → ₹43,902 of gain, all within the ₹1.25L exemption
    expect(saleTax(fund, 2_00_000_00, '2026-11-02')[0]!.amountPaise).toBe(0);
    // Selling everything: ₹90,000 gain, still exempt
    const big = { ...fund, valuePaise: 8_00_000_00, costPaise: 3_00_000_00 };
    // ₹5L gain − ₹1.25L exemption = ₹3.75L × 12.5% = ₹46,875
    expect(saleTax(big, 8_00_000_00, '2026-11-02')[0]!.amountPaise).toBe(46_875_00);
  });

  it('short-term equity at 20%, debt at slab, gold long-term after 24 months, FD early-withdrawal penalty', () => {
    const recent = { ...fund, acquiredAt: '2026-06-01' };
    expect(saleTax(recent, 4_10_000_00, '2026-11-02')[0]!.amountPaise).toBe(18_000_00); // 20% of ₹90k
    const debt = { ...fund, assetClass: 'debt' as const };
    expect(saleTax(debt, 4_10_000_00, '2026-11-02')[0]!.amountPaise).toBe(27_000_00); // 30% of ₹90k
    const gold = { ...fund, kind: 'gold' as const, assetClass: 'gold' as const, acquiredAt: '2023-10-24' };
    expect(saleTax(gold, 4_10_000_00, '2026-11-02')[0]!.amountPaise).toBe(11_250_00); // 12.5% of ₹90k
    const fd = { ...fund, kind: 'fixed_deposit' as const, assetClass: 'fixed_deposit' as const, valuePaise: 8_00_000_00, costPaise: 8_00_000_00, acquiredAt: '2025-11-02' };
    expect(saleTax(fd, 8_00_000_00, '2026-11-02')[0]!.amountPaise).toBe(8_000_00); // 1% for one year
  });

  it('lost returns compound over the months the money is needed', () => {
    expect(lostReturnPaise(2_00_000_00, 1200, 12)).toBe(24_000_00);
    expect(lostReturnPaise(2_00_000_00, 1200, 6)).toBe(11_660_10);
  });

  it('borrowing is capped at a conservative share of value', () => {
    expect(maxBorrowPaise(fund)).toBe(2_05_000_00); // 50% of equity
    expect(maxBorrowPaise({ ...fund, assetClass: 'debt' })).toBe(3_07_500_00);
    expect(maxBorrowPaise({ ...fund, pledgedPaise: 1_00_000_00 })).toBe(1_55_000_00);
  });
});

describe('sell vs borrow decision', () => {
  const s = fullPayer({ smartSavings: 'never' });

  it('needs a quote, then offers borrowing when it costs less than selling (member-initiated: no Smart Savings needed)', () => {
    expect(evaluateSellVsBorrow(s, req(2_00_000_00), null)).toMatchObject({ kind: 'needs_quotes', principalPaise: 2_00_000_00, tenureMonths: 12 });
    const r = evaluateSellVsBorrow(s, req(2_00_000_00), quote(2_00_000_00));
    if (r.kind !== 'decision') throw new Error('expected decision');
    const d = r.decision;
    expect(d.outcome).toBe('offer');
    expect(d.offer!.status).toBe('shown');
    const costs = sellVsBorrowCosts(req(2_00_000_00), s.today, quote(2_00_000_00));
    expect(d.netBenefitPaise).toBe(costs.sell.totalCostPaise - costs.borrow!.totalCostPaise);
    expect(d.netBenefitPaise!).toBeGreaterThan(0);
    expect(d.offer!.options.map((o) => o.key)).toEqual(['sell', 'loan']);
    expect(d.offer!.headline).toMatch(/^If you need ₹2,00,000 for 12 months/);
    for (const t of memberFacingStrings(d)) expect(t).not.toMatch(BANNED_MEMBER_WORDS);
  });

  it('above the loan-to-value cap: no loan, selling is the way', () => {
    const r = evaluateSellVsBorrow(s, req(3_00_000_00), null);
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.reasons).toEqual(['above_affordability']);
    expect(r.decision.offer).toBeNull();
    expect(r.decision.explanation).toMatch(/up to ₹2,05,000/);
  });

  it('a stressed member gets help, not a loan; selling stays available', () => {
    const r = evaluateSellVsBorrow(stressed(), req(1_00_000_00), quote(1_00_000_00));
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.outcome).toBe('help');
    expect(r.decision.offer).toBeNull();
  });

  it('no offer when selling is cheaper (short need, no gains, low expected return)', () => {
    const fd = { ...fund, kind: 'fixed_deposit' as const, assetClass: 'fixed_deposit' as const, valuePaise: 5_00_000_00, costPaise: 5_00_000_00, acquiredAt: '2026-10-01', expectedReturnBps: 700 };
    const r = evaluateSellVsBorrow(s, req(1_00_000_00, fd, 3), quote(1_00_000_00, 3, 1050));
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.reasons).toEqual(['no_net_benefit']);
    expect(r.decision.offer).toBeNull();
  });

  it('cannot sell more than is free', () => {
    const r = evaluateSellVsBorrow(s, req(5_00_000_00), null);
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.reasons).toEqual(['not_eligible']);
  });

  it('one active offer at a time still applies', () => {
    const r = evaluateSellVsBorrow(fullPayer({ offers: { ...fullPayer().offers, activeOfferId: 'o1' } }), req(1_00_000_00), null);
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.reasons).toEqual(['active_offer_exists']);
  });
});
