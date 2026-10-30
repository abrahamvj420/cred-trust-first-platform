import { describe, expect, it } from 'vitest';
import { PARTNER_EMI_RATE_PA_BPS, REFERENCE_CASE } from './constants';
import { amortise, cardCost, cardVsEmi, emiCost } from './finance';

const { principalPaise, tenureMonths } = REFERENCE_CASE;
const ONE_RUPEE = 100;

describe('savings method: ₹1 lakh over 12 months', () => {
  it('card total cost is ₹28,533', () => {
    expect(Math.abs(cardCost(principalPaise, tenureMonths).totalCostPaise - 28_533_00)).toBeLessThanOrEqual(ONE_RUPEE);
  });

  it('saving at 16% p.a. is ₹18,476', () => {
    const { savingPaise } = cardVsEmi(principalPaise, tenureMonths, PARTNER_EMI_RATE_PA_BPS.min);
    expect(Math.abs(savingPaise - 18_476_00)).toBeLessThanOrEqual(ONE_RUPEE);
  });

  it('saving at 18% p.a. is ₹17,337', () => {
    const { savingPaise } = cardVsEmi(principalPaise, tenureMonths, PARTNER_EMI_RATE_PA_BPS.max);
    expect(Math.abs(savingPaise - 17_337_00)).toBeLessThanOrEqual(ONE_RUPEE);
  });

  it('every partner rate keeps the saving within the published ₹17,300–18,500 range', () => {
    for (let bps = PARTNER_EMI_RATE_PA_BPS.min; bps <= PARTNER_EMI_RATE_PA_BPS.max; bps += 25) {
      const { savingPaise } = cardVsEmi(principalPaise, tenureMonths, bps);
      expect(savingPaise).toBeGreaterThanOrEqual(17_300_00);
      expect(savingPaise).toBeLessThanOrEqual(18_500_00);
    }
  });

  it('EMI cost includes the 1% fee and 18% GST on the fee', () => {
    const e = emiCost(principalPaise, tenureMonths, 1600);
    expect(e.processingFeePaise).toBe(1_000_00);
    expect(e.gstOnFeePaise).toBe(180_00);
  });
});

describe('amortise', () => {
  it('pays the principal back exactly', () => {
    const s = amortise(1_50_000_00, 0.015, 9);
    expect(s.reduce((a, i) => a + i.principalPaise, 0)).toBe(1_50_000_00);
    expect(s.at(-1)!.balanceAfterPaise).toBe(0);
  });

  it('handles a zero rate', () => {
    const s = amortise(12_000_00, 0, 12);
    expect(s.every((i) => i.interestPaise === 0)).toBe(true);
  });

  it('rejects non-integer paise', () => {
    expect(() => amortise(100.5, 0.01, 3)).toThrow();
  });
});
