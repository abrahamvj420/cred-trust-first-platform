import { describe, expect, it } from 'vitest';
import { BANNED_MEMBER_WORDS } from '../member-copy';
import { fullPayer, stressed } from '../test/fixtures';
import { billOutcome, creditLine, evaluateLadderChange, ladderAfter, nextTier } from './credit-ladder';

describe('bill outcome', () => {
  it('paid in full on time, part paid, missed', () => {
    expect(billOutcome({ totalDuePaise: 100, minDuePaise: 10, paidPaise: 100, allOnTime: true })).toBe('paid_in_full');
    expect(billOutcome({ totalDuePaise: 100, minDuePaise: 10, paidPaise: 40, allOnTime: true })).toBe('part_paid');
    expect(billOutcome({ totalDuePaise: 100, minDuePaise: 10, paidPaise: 5, allOnTime: true })).toBe('missed');
    expect(billOutcome({ totalDuePaise: 100, minDuePaise: 10, paidPaise: 100, allOnTime: false })).toBe('missed');
    expect(billOutcome({ totalDuePaise: 0, minDuePaise: 0, paidPaise: 0, allOnTime: true })).toBe('paid_in_full');
  });
});

describe('ladder steps', () => {
  it('in-full payments build the streak and move up a tier when it reaches the next one', () => {
    let pos = { tier: 'starter' as const, onTimeStreak: 1 };
    const a = ladderAfter(pos, 'paid_in_full');
    expect(a).toEqual({ tier: 'starter', onTimeStreak: 2, change: 'none' });
    const b = ladderAfter(a, 'paid_in_full');
    expect(b).toEqual({ tier: 'silver', onTimeStreak: 3, change: 'up' });
    pos = { tier: 'starter', onTimeStreak: 8 };
    expect(ladderAfter(pos, 'paid_in_full').tier).toBe('gold');
  });

  it('a part payment resets the streak but keeps the tier; a missed one steps down a tier', () => {
    expect(ladderAfter({ tier: 'gold', onTimeStreak: 12 }, 'part_paid')).toEqual({ tier: 'gold', onTimeStreak: 0, change: 'none' });
    expect(ladderAfter({ tier: 'gold', onTimeStreak: 12 }, 'missed')).toEqual({ tier: 'silver', onTimeStreak: 0, change: 'down' });
    expect(ladderAfter({ tier: 'starter', onTimeStreak: 2 }, 'missed')).toEqual({ tier: 'starter', onTimeStreak: 0, change: 'none' });
  });

  it('a kept tier does not fall when the streak restarts, and climbs again from its own requirement', () => {
    const after = ladderAfter({ tier: 'gold', onTimeStreak: 0 }, 'paid_in_full');
    expect(after).toEqual({ tier: 'gold', onTimeStreak: 1, change: 'none' });
    expect(nextTier(after)).toEqual({ tier: 'platinum', paymentsNeeded: 17 });
  });

  it('next tier and payments needed', () => {
    expect(nextTier({ tier: 'starter', onTimeStreak: 1 })).toEqual({ tier: 'silver', paymentsNeeded: 2 });
    expect(nextTier({ tier: 'platinum', onTimeStreak: 30 })).toBeNull();
  });
});

describe('credit line', () => {
  it('is the tier’s limit and rate; verified salary raises the limit (capped) and lowers the rate', () => {
    expect(creditLine('gold', null, false)).toMatchObject({ limitPaise: 3_00_000_00, ratePaBps: 1650, basis: 'ladder', shown: true });
    expect(creditLine('gold', 2_10_000_00, false)).toMatchObject({ limitPaise: 5_00_000_00, ratePaBps: 1550, basis: 'salary_verified' });
    // Salary multiple below the tier limit never lowers it
    expect(creditLine('platinum', 50_000_00, false).limitPaise).toBe(5_00_000_00);
    expect(creditLine('starter', 95_000_00, false).limitPaise).toBe(2_85_000_00);
  });

  it('is hidden while the member clears a balance, with supportive wording', () => {
    const c = creditLine('silver', null, true);
    expect(c.shown).toBe(false);
    expect(c.note).not.toMatch(BANNED_MEMBER_WORDS);
  });
});

describe('ladder decisions (shown as available, never pushed)', () => {
  it('a tier unlock is recorded as available, not an offer', () => {
    const r = evaluateLadderChange(fullPayer(), { tier: 'starter', onTimeStreak: 2 }, { tier: 'silver', onTimeStreak: 3, change: 'up' });
    expect(r.kind).toBe('decision');
    if (r.kind !== 'decision') return;
    expect(r.decision.outcome).toBe('available');
    expect(r.decision.offer).toBeNull();
    expect(r.decision.feature).toBe('earned_credit_ladder');
    expect(r.decision.explanation).toMatch(/won’t suggest you borrow/);
  });

  it('a stressed member reaching a tier is told it is earned but the limit stays hidden', () => {
    const r = evaluateLadderChange(stressed(), { tier: 'starter', onTimeStreak: 2 }, { tier: 'silver', onTimeStreak: 3, change: 'up' });
    if (r.kind !== 'decision') throw new Error('expected decision');
    expect(r.decision.outcome).toBe('help');
    expect(r.decision.explanation).not.toMatch(BANNED_MEMBER_WORDS);
  });
});
