/** M5 "Grow": Wealth Management (7): link via Account Aggregator, gold self-declared, goals, fees disclosed. */
import { credApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { cred, decideConsent, login, resetWorld } from './helpers';

beforeEach(resetWorld);

describe('Wealth Management (7): trigger is linking a portfolio through Account Aggregator', () => {
  it('link → holdings with fees disclosed; gold declared; goals planned; advice never comes with a product', async () => {
    const token = await login('aarav');
    expect(await cred(credApi.products.holdings, { token })).toMatchObject({ linked: false, holdings: [] });

    const start = await cred(credApi.member.startAaConsent, { token, body: { purpose: 'portfolio_tracking', returnTo: '/wealth' } });
    const { detail } = await decideConsent(start.redirectUrl);
    expect(detail.fiTypes).toEqual(['MUTUAL_FUNDS', 'TERM_DEPOSIT']);
    const ready = await cred(credApi.member.aaConsent, { token, params: { consentId: start.consent.id } });
    expect(ready).toMatchObject({ dataReady: true, returnTo: '/wealth' });

    const p = await cred(credApi.products.holdings, { token });
    expect(p.linked).toBe(true);
    expect(p.holdings).toHaveLength(2);
    for (const h of p.holdings) {
      expect(h.source).toBe('aa');
      expect(h.annualFeePaise).toBe(Math.round((h.valuePaise * h.expenseRatioBps!) / 10_000));
    }
    expect(p.annualFeesPaise).toBe(p.holdings.reduce((a, h) => a + h.annualFeePaise, 0));
    expect(p.gainPaise).toBe(p.totalValuePaise - p.totalCostPaise);

    // Gold isn't on the Account Aggregator: the member declares it
    const gold = (await cred(credApi.products.addGold, { token, body: { grams: 10, costPaise: 60_000_00, acquiredOn: '2024-01-10' } })).holding;
    expect(gold).toMatchObject({ source: 'self_declared', assetClass: 'gold', valuePaise: 78_500_00, annualFeePaise: 0 });

    const goal = (await cred(credApi.products.createGoal, { token, body: { name: 'Sabbatical', targetPaise: 6_00_000_00, targetDate: '2028-06-30', currentPaise: 1_00_000_00 } })).goal;
    expect(goal.monthlyPlanPaise).toBeGreaterThan(0);
    expect(goal.feeRateBps).toBeGreaterThan(0);
    expect(goal.annualFeesPaise).toBe(Math.round((6_00_000_00 * goal.feeRateBps) / 10_000));
    const patched = (await cred(credApi.products.updateGoal, { token, params: { goalId: goal.id }, body: { currentPaise: 6_50_000_00 } })).goal;
    expect(patched).toMatchObject({ onTrack: true, monthlyPlanPaise: 0, name: 'Sabbatical' });

    // Advice is kept separate from product sales: none of this produced a decision or an offer
    const memberId = (await cred(credApi.member.home, { token })).member.id;
    expect((await cred(credApi.admin.decisions, { query: { memberId } })).decisions).toEqual([]);
    expect((await cred(credApi.products.offers, { token })).history).toEqual([]);

    // Turning off portfolio sharing deletes the linked holdings (declared gold stays: the member told us)
    await cred(credApi.member.withdrawPermission, { token, params: { scope: 'portfolio_data' } });
    const after = await cred(credApi.products.holdings, { token });
    expect(after.linked).toBe(false);
    expect(after.holdings.map((h) => h.source)).toEqual(['self_declared']);
  });

  it('blocked: a goal date in the past is refused; linked holdings can’t be deleted by hand', async () => {
    const token = await login('sneha');
    await expect(cred(credApi.products.createGoal, { token, body: { name: 'Past', targetPaise: 1_00_000_00, targetDate: '2026-01-01' } })).rejects.toMatchObject({ status: 422 });
    const fund = (await cred(credApi.products.holdings, { token })).holdings.find((h) => h.source === 'aa')!;
    await expect(cred(credApi.products.removeHolding, { token, params: { holdingId: fund.id } })).rejects.toMatchObject({ status: 409 });
    // The seeded goal shows a plan with fees, against Sneha's real fund fees
    const [g] = (await cred(credApi.products.goals, { token })).goals;
    expect(g).toMatchObject({ name: 'House down payment' });
    expect(g!.feeRateBps).toBeGreaterThan(0);
  });
});
