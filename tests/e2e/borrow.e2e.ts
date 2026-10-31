/**
 * M5 "Borrow better": Card-Balance Switch (8), Wealth-Backed Liquidity (2) and
 * Salary-Verified Credit (5), each from its real-world trigger.
 */
import { credApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, buyOnShopKart, cred, decideConsent, eventually, login, resetWorld, scenario, settle } from './helpers';

beforeEach(resetWorld);

const me = async (token: string) => (await cred(credApi.member.home, { token })).member.id;
const decisions = async (memberId: string, feature: string) => (await cred(credApi.admin.decisions, { query: { memberId } })).decisions.filter((d) => d.feature === feature);

describe('Card-Balance Switch (8): trigger is a part payment in CRED', () => {
  it('a part payment brings the switch offer; accepting moves the balance to an EMI whose rate steps down for on-time payments', async () => {
    const token = await login('kabir');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    const due = card.nextDue!.totalDuePaise;
    // The bill is never blocked or delayed by an offer: the payment goes through first
    const paid = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 30_000_00, source: 'upi' } });
    expect(paid.statement.status).toBe('partial');

    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'switch offer');
    expect(offer).toMatchObject({ feature: 'card_balance_switch', status: 'shown', origin: 'proactive' });
    const left = due - 30_000_00;
    expect(offer.headline).toMatch(new RegExp(`^If you carry the remaining ₹${(left / 100).toLocaleString('en-IN')}, moving it to an EMI saves you ₹`));
    expect(offer.options.map((o) => o.key)).toEqual(['pay_in_full', 'card_revolve', 'emi']);
    const emi = offer.options.find((o) => o.key === 'emi')!;
    expect(emi.terms).toMatchObject({ kind: 'loan', loanKind: 'balance_switch_emi', ratePaBps: 1700, rateStepDown: [{ afterOnTimePayments: 2, ratePaBps: 1600 }, { afterOnTimePayments: 4, ratePaBps: 1500 }] });

    const kfs = await cred(credApi.products.keyFacts, { token, params: { offerId: offer.id }, query: { option: 'emi' } });
    expect(kfs.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Rate after 2 on-time EMIs', 'Rate after 4 on-time EMIs']));
    const acc = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
    await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: acc.otp.demoOtp } });
    await settle();

    // The lender paid the rest of the bill: nothing left due on the card
    const after = (await cred(credApi.member.cards, { token })).cards[0]!;
    expect(after.nextDue).toMatchObject({ remainingPaise: 0, status: 'paid' });
    const loan = (await cred(credApi.products.loans, { token })).loans[0]!;
    expect(loan).toMatchObject({ kind: 'balance_switch_emi', status: 'disbursed', principalPaise: left, ratePaBps: 1700 });

    // Two on-time EMIs later, the rate steps down and the rest is re-priced
    await advance(2);
    const stepped = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(stepped.ratePaBps).toBe(1600);
    expect(stepped.schedule.filter((i) => i.status === 'paid')).toHaveLength(2);
    expect((await cred(credApi.products.alerts, { token })).alerts.map((a) => a.title)).toContain('Your EMI rate dropped to 16%');
  });

  it('blocked: a member paying only the minimum, month after month, gets help instead of a switch', async () => {
    const token = await login('rohan');
    // Rohan can't cover his bill; the minimum is what he can do this month (the bank refuses more)
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 5_000_00, source: 'upi' } });
    const [d] = await eventually(async () => {
      const x = await decisions(await me(token), 'card_balance_switch');
      return x.length ? x : null;
    }, 'switch decision');
    expect(d).toMatchObject({ outcome: 'help', offerId: null });
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
  });

  it('blocked: a small balance left over is not worth switching', async () => {
    const token = await login('aarav');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: card.nextDue!.totalDuePaise - 2_000_00, source: 'upi' } });
    const [d] = await eventually(async () => {
      const x = await decisions(await me(token), 'card_balance_switch');
      return x.length ? x : null;
    }, 'switch decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['no_signal'] });
  });
});

describe('Wealth-Backed Liquidity (2): trigger is the member starting to sell', () => {
  const flexi = async (token: string) => (await cred(credApi.products.holdings, { token })).holdings.find((h) => h.name.startsWith('Meridian Flexi'))!;

  it('sell vs borrow in rupees; borrowing against the fund is cheaper, so it is offered; the lender pledges the units', async () => {
    const token = await login('sneha');
    const fund = await flexi(token);
    const r = await cred(credApi.products.sellIntent, { token, body: { holdingId: fund.id, amountNeededPaise: 2_00_000_00, months: 12 } });
    expect(r.recommendation).toBe('borrow');
    expect(r.sell.lines.map((l) => l.kind)).toEqual(['tax', 'lost_return']);
    expect(r.borrow!.totalCostPaise).toBeLessThan(r.sell.totalCostPaise);
    expect(r.netBenefitPaise).toBe(r.sell.totalCostPaise - r.borrow!.totalCostPaise);
    expect(r.maxBorrowPaise).toBe(Math.floor(fund.valuePaise / 2 / 100) * 100);
    expect(r.offerId).not.toBeNull();

    const offer = (await cred(credApi.products.offer, { token, params: { offerId: r.offerId! } })).offer;
    expect(offer).toMatchObject({ feature: 'wealth_backed_liquidity', origin: 'member_initiated', status: 'shown', benefitLabel: 'less than selling' });
    const kfs = await cred(credApi.products.keyFacts, { token, params: { offerId: offer.id }, query: { option: 'loan' } });
    expect(kfs.items.find((i) => i.label === 'Type')!.value).toBe('Loan against your holdings');
    expect(kfs.highlights.join(' ')).toMatch(/lien/);
    const acc = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'loan', keyFactsAcknowledged: true } });
    await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: acc.otp.demoOtp } });
    await settle();
    const loan = (await cred(credApi.products.loans, { token })).loans[0]!;
    expect(loan).toMatchObject({ kind: 'loan_against_funds', status: 'disbursed', lenderName: 'Keystone Capital' });
    expect((await flexi(token)).pledged).toBe(true);
    expect((await cred(credApi.products.sellIntentDetail, { token, params: { intentId: r.intentId } })).status).toBe('borrowed');

    // A market fall: the member hears about it calmly, with what (if anything) to do
    await scenario('market_fall', 'sneha');
    const alerts = (await cred(credApi.products.alerts, { token })).alerts;
    expect(alerts.map((a) => a.kind)).toEqual(expect.arrayContaining(['collateral', 'market_fall']));
    const collateral = alerts.find((a) => a.kind === 'collateral')!;
    expect(collateral.title).toMatch(/of your pledged holdings/);
    for (const a of alerts) expect(`${a.title} ${a.body}`).not.toMatch(/stress|risk|blocked/i);
  });

  it('blocked: above the safe share of value there is no loan; selling goes through the fund house', async () => {
    const token = await login('sneha');
    const fund = await flexi(token);
    const big = Math.floor((fund.valuePaise * 0.8) / 100) * 100;
    const r = await cred(credApi.products.sellIntent, { token, body: { holdingId: fund.id, amountNeededPaise: big, months: 6 } });
    expect(r).toMatchObject({ recommendation: 'sell', borrow: null, offerId: null });
    expect(r.explanation).toMatch(/You can borrow up to/);
    const d = await cred(credApi.admin.decisions, { query: { memberId: await me(token), feature: 'wealth_backed_liquidity' } });
    expect(d.decisions[0]).toMatchObject({ outcome: 'blocked', reasons: ['above_affordability'] });

    const s = await cred(credApi.products.confirmSell, { token, params: { intentId: r.intentId } });
    expect(s.status).toBe('requested');
    await settle();
    expect((await cred(credApi.products.sellIntentDetail, { token, params: { intentId: r.intentId } })).status).toBe('sold');
    // The fund house redeems whole units to three decimals, so the value left is within ₹1 of a straight subtraction
    expect(Math.abs((await flexi(token)).valuePaise - (fund.valuePaise - big))).toBeLessThanOrEqual(100);
  });
});

describe('Salary-Verified Credit (5): trigger is the member choosing to verify', () => {
  it('Account Aggregator consent → salary from the bank → better limit and rate; it never starts an offer by itself', async () => {
    const token = await login('aarav');
    const memberId = await me(token);
    const before = await cred(credApi.member.income, { token });
    expect(before).toMatchObject({ income: null, after: null, before: { limitPaise: 3_00_000_00, ratePaBps: 1650 } });

    const start = await cred(credApi.member.startAaConsent, { token, body: { purpose: 'income_verification', returnTo: '/credit' } });
    expect(start.consent.status).toBe('PENDING');
    const { detail, redirectUrl } = await decideConsent(start.redirectUrl);
    expect(detail).toMatchObject({ fiuName: 'CRED', purpose: 'income_verification', fiTypes: ['DEPOSIT'], dataRangeMonths: 6 });
    expect(redirectUrl).toMatch(/\/aa\/return\?consent=.+&status=approved$/);

    const after = await eventually(async () => {
      const x = await cred(credApi.member.income, { token });
      return x.income ? x : null;
    }, 'income verified');
    expect(after.income).toMatchObject({ monthlyNetPaise: 2_10_000_00, employer: 'Lattice Labs Pvt Ltd', monthsVerified: 6 });
    expect(after.after).toMatchObject({ limitPaise: 5_00_000_00, ratePaBps: 1550, basis: 'salary_verified' });
    expect((await cred(credApi.member.permissions, { token })).permissions.find((p) => p.scope === 'income_data')).toMatchObject({ status: 'granted' });
    const ds = await decisions(memberId, 'salary_verified_credit');
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ outcome: 'available', offerId: null });
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
    expect((await cred(credApi.products.offers, { token })).history).toEqual([]);

    // The better rate shows up when the member does need credit: lenders price verified salary lower
    await buyOnShopKart('aarav', 2_20_000_00, 'Aero 16 Pro');
    const txn = (await cred(credApi.member.transactions, { token, query: { limit: 1 } })).transactions[0]!;
    const conv = await eventually(async () => {
      const r = await cred(credApi.products.convertToEmi, { token, params: { transactionId: txn.id } }).catch(() => null);
      return r?.offer ? r : null;
    }, 'EMI offer');
    expect(conv.offer!.options.find((o) => o.key === 'emi')!.terms).toMatchObject({ ratePaBps: 1500 });

    // Withdrawing deletes the verified income and revokes the consent
    await cred(credApi.member.withdrawPermission, { token, params: { scope: 'income_data' } });
    expect((await cred(credApi.member.income, { token })).income).toBeNull();
    expect((await cred(credApi.member.aaConsents, { token })).consents[0]).toMatchObject({ purpose: 'income_verification', status: 'REVOKED' });
  });

  it('blocked: rejecting at the Account Aggregator changes nothing', async () => {
    const token = await login('kabir');
    const start = await cred(credApi.member.startAaConsent, { token, body: { purpose: 'income_verification', returnTo: '/credit' } });
    const r = await decideConsent(start.redirectUrl, 'reject');
    expect(r.status).toBe('REJECTED');
    const income = await cred(credApi.member.income, { token });
    expect(income).toMatchObject({ income: null, consent: { status: 'REJECTED' } });
    expect(await decisions(await me(token), 'salary_verified_credit')).toEqual([]);
  });
});
