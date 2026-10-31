/**
 * M5: the simulated clock. "Advance a month" closes statements, applies due
 * dates, updates credit ladder streaks and moves members up tiers (feature 3).
 */
import { credApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, cred, login, resetWorld } from './helpers';

beforeEach(resetWorld);

const decisionsFor = async (memberId: string, feature: string) => (await cred(credApi.admin.decisions, { query: { memberId } })).decisions.filter((d) => d.feature === feature);

describe('advancing the clock', () => {
  it('closes statements, applies due dates and lets each persona’s own habit pay the bill', async () => {
    const token = await login('aarav');
    const before = (await cred(credApi.member.cards, { token })).cards[0]!;
    expect(before.nextDue).toMatchObject({ dueDate: '2026-11-05', status: 'open' });

    const r = await advance();
    expect(r).toMatchObject({ from: '2026-11-02', to: '2026-12-02' });
    expect((await cred(credApi.member.home, { token })).simDate).toBe('2026-12-02');

    const statements = (await cred(credApi.member.statements, { token, params: { cardId: before.id } })).statements;
    // The October bill was paid in full at the bank before its due date and is settled
    expect(statements.find((s) => s.dueDate === '2026-11-05')).toMatchObject({ status: 'paid' });
    // A new statement closed on the billing day, due next month
    expect(statements[0]).toMatchObject({ periodStart: '2026-10-16', periodEnd: '2026-11-15', dueDate: '2026-12-05', status: 'open' });
    const after = (await cred(credApi.member.cards, { token })).cards[0]!;
    expect(after.nextDue!.statementId).toBe(statements[0]!.id);
    expect(after.nextDue!.totalDuePaise).toBeGreaterThan(0);
  });

  it('on-time, in-full bills build the streak and move a member up a tier (shown as available, never pushed)', async () => {
    const token = await login('priya');
    const start = await cred(credApi.member.creditLadder, { token });
    expect(start).toMatchObject({ tier: 'silver', onTimeStreak: 7, nextTier: 'gold', nextTierInMonths: 2 });

    await advance();
    expect(await cred(credApi.member.creditLadder, { token })).toMatchObject({ tier: 'silver', onTimeStreak: 8, nextTierInMonths: 1 });
    await advance();
    const ladder = await cred(credApi.member.creditLadder, { token });
    expect(ladder).toMatchObject({ tier: 'gold', onTimeStreak: 9, nextTier: 'platinum', nextTierInMonths: 9 });
    expect(ladder.tiers.find((t) => t.tier === 'gold')).toMatchObject({ unlocked: true, current: true });
    expect(ladder.creditLine).toMatchObject({ limitPaise: 3_00_000_00, ratePaBps: 1650, shown: true, basis: 'ladder' });
    expect(ladder.history.find((h) => h.dueDate === '2026-11-05')).toMatchObject({ outcome: 'paid_in_full', counted: true });

    // Recorded as a decision, but never as an offer
    const memberId = (await cred(credApi.member.home, { token })).member.id;
    const [d] = await decisionsFor(memberId, 'earned_credit_ladder');
    expect(d).toMatchObject({ outcome: 'available', offerId: null });
    expect(d!.explanation).toMatch(/Gold is unlocked/);
    expect((await cred(credApi.products.offers, { token })).history.filter((o) => o.feature === 'earned_credit_ladder')).toEqual([]);
    const alerts = (await cred(credApi.products.alerts, { token })).alerts;
    expect(alerts.find((a) => a.kind === 'ladder')).toMatchObject({ title: 'Gold unlocked', read: false });
  });

  it('blocked: paying only part of the bill restarts the streak and unlocks nothing', async () => {
    const token = await login('kabir');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 20_000_00, source: 'upi' } });
    await advance();
    const ladder = await cred(credApi.member.creditLadder, { token });
    expect(ladder).toMatchObject({ tier: 'starter', onTimeStreak: 0 });
    expect(ladder.history.find((h) => h.dueDate === '2026-11-05')).toMatchObject({ outcome: 'part_paid', counted: false });
    const memberId = (await cred(credApi.member.home, { token })).member.id;
    expect(await decisionsFor(memberId, 'earned_credit_ladder')).toEqual([]);
  });

  it('a bill paid below the minimum is missed: overdue, interest on what carries, and a step down a tier', async () => {
    const token = await login('priya');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 500_00, source: 'upi' } });
    await advance();
    const statements = (await cred(credApi.member.statements, { token, params: { cardId: card.id } })).statements;
    const old = statements.find((s) => s.dueDate === '2026-11-05')!;
    expect(old).toMatchObject({ status: 'overdue', paidPaise: 500_00 });
    // What carried is on the new bill with 3.5% interest plus GST
    const carried = old.totalDuePaise - 500_00;
    expect(statements[0]!.totalDuePaise).toBeGreaterThanOrEqual(carried + Math.round(Math.round(carried * 0.035) * 1.18));
    const ladder = await cred(credApi.member.creditLadder, { token });
    expect(ladder).toMatchObject({ tier: 'starter', onTimeStreak: 0 });
    expect(ladder.history.find((h) => h.dueDate === '2026-11-05')!.outcome).toBe('missed');
    const memberId = (await cred(credApi.member.home, { token })).member.id;
    const [d] = await decisionsFor(memberId, 'earned_credit_ladder');
    expect(d!.explanation).toMatch(/wasn’t paid by its due date/);
    expect(d!.explanation).not.toMatch(/stress|risk|blocked/i);
  });

  it('short of cash, the persona’s habit pays what it can: a part payment, not a missed bill', async () => {
    const token = await login('kabir'); // this month's bill includes a flight; ₹62,000 in the bank
    await advance();
    const ladder = await cred(credApi.member.creditLadder, { token });
    expect(ladder.history.find((h) => h.dueDate === '2026-11-05')!.outcome).toBe('part_paid');
    expect(ladder.onTimeStreak).toBe(0);
  });

  it('a six-month run keeps every service consistent and moves a steady payer up the ladder', async () => {
    const token = await login('kabir');
    await advance(6);
    // First bill part-paid (the flight), then five in full: Silver at three
    expect(await cred(credApi.member.creditLadder, { token })).toMatchObject({ tier: 'silver', onTimeStreak: 5 });
    expect((await cred(credApi.member.home, { token })).simDate).toBe('2027-05-02');
  });
});
