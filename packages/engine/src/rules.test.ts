import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, RULE_DEFINITIONS, validateRuleChange } from './rules';

describe('rule settings', () => {
  it('every default sits inside its allowed range', () => {
    for (const [k, d] of Object.entries(RULE_DEFINITIONS)) {
      expect(d.value, k).toBeGreaterThanOrEqual(d.min);
      expect(d.value, k).toBeLessThanOrEqual(d.max);
      expect(validateRuleChange(DEFAULT_RULES, k, d.value), k).toBeNull();
    }
  });

  it('changes outside the range, unknown keys and fractions are refused', () => {
    expect(validateRuleChange(DEFAULT_RULES, 'cardInterestMonthlyBps', 900)).toMatch(/between 1% and 5%/);
    expect(validateRuleChange(DEFAULT_RULES, 'nope', 1)).toMatch(/Unknown/);
    expect(validateRuleChange(DEFAULT_RULES, 'monthlyProactiveOfferCap', 2.5)).toMatch(/whole number/);
    expect(validateRuleChange(DEFAULT_RULES, 'monthlyProactiveOfferCap', 1)).toBeNull();
  });

  it('dependent rules stay consistent', () => {
    expect(validateRuleChange(DEFAULT_RULES, 'partnerRateMinBps', 1900)).toMatch(/lowest partner rate/);
    expect(validateRuleChange(DEFAULT_RULES, 'wellnessHalfScore', 90)).toMatch(/must rise/);
    expect(validateRuleChange(DEFAULT_RULES, 'ltvEquityBps', 5000)).toBeNull();
  });
});
