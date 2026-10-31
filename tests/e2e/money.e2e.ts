/**
 * M4 money flows across real services: bill pay (full, partial, minimum,
 * insufficient funds), UPI with the switch's PIN step, rewards, card detail.
 */
import { credApi, ecosystemApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { buyOnShopKart, cred, eco, eventually, login, resetWorld } from './helpers';

beforeEach(resetWorld);

const firstCard = async (token: string) => (await cred(credApi.member.cards, { token })).cards[0]!;

describe('bill pay', () => {
  it('full payment settles the statement, lowers the balance and earns coins', async () => {
    const token = await login('aarav');
    const card = await firstCard(token);
    const due = card.nextDue!;
    expect(due.remainingPaise).toBe(due.totalDuePaise);
    const coinsBefore = (await cred(credApi.member.rewards, { token })).balance;

    const r = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'full', source: 'upi' } });
    expect(r.payment).toMatchObject({ kind: 'full', source: 'upi', amountPaise: due.totalDuePaise, onTime: true });
    expect(r.statement.status).toBe('paid');
    expect(r.card.outstandingPaise).toBe(card.outstandingPaise - due.totalDuePaise);
    expect(r.card.nextDue!.remainingPaise).toBe(0);
    expect(r.coinsEarned).toBe(Math.floor(due.totalDuePaise / 100 / 100) * 10);
    expect((await cred(credApi.member.rewards, { token })).balance).toBe(coinsBefore + r.coinsEarned);

    await expect(cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'full', source: 'upi' } })).rejects.toMatchObject({ status: 409 });
  });

  it('a partial payment is recorded as partial, with the remainder still due (Card-Balance Switch reads this)', async () => {
    const token = await login('kabir');
    const card = await firstCard(token);
    const r = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 20_000_00, source: 'netbanking' } });
    expect(r.payment).toMatchObject({ kind: 'custom', source: 'netbanking', amountPaise: 20_000_00 });
    expect(r.statement).toMatchObject({ status: 'partial', paidPaise: 20_000_00 });
    expect(r.card.nextDue).toMatchObject({ status: 'partial', remainingPaise: card.nextDue!.totalDuePaise - 20_000_00 });

    const detail = await cred(credApi.member.card, { token, params: { cardId: card.id } });
    expect(detail.payments[0]).toMatchObject({ kind: 'custom', amountPaise: 20_000_00 });

    // A second part-payment adds up; still partial
    const more = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: 10_000_00, source: 'upi' } });
    expect(more.statement).toMatchObject({ status: 'partial', paidPaise: 30_000_00 });
    // The rest is more than Kabir's ₹32,000 left in the bank: refused, nothing recorded
    await expect(cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'full', source: 'upi' } })).rejects.toMatchObject({
      status: 422,
      code: 'insufficient_funds',
    });
    expect((await firstCard(token)).nextDue!.paidPaise).toBe(30_000_00);
  });

  it('minimum payment works; a payment the bank account can’t cover is refused and nothing is recorded', async () => {
    const token = await login('rohan'); // ₹6,200 in the bank
    const card = await firstCard(token);
    await expect(cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'full', source: 'upi' } })).rejects.toMatchObject({
      status: 422,
      code: 'insufficient_funds',
    });
    expect((await firstCard(token)).nextDue!.paidPaise).toBe(0);

    const r = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'minimum', source: 'upi' } });
    expect(r.payment).toMatchObject({ kind: 'minimum', amountPaise: card.nextDue!.minDuePaise });
    expect(r.statement.status).toBe('partial');
  });

  it('bill pay is never blocked by an open offer', async () => {
    const token = await login('aarav');
    await buyOnShopKart('aarav', 1_50_000_00);
    await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'offer pending');
    const card = await firstCard(token);
    const r = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'full', source: 'netbanking' } });
    expect(r.statement.status).toBe('paid');
  });
});

describe('UPI pay', () => {
  it('contacts → resolve → initiate → wrong PIN → right PIN → success seen by CRED', async () => {
    const token = await login('priya');
    const { contacts } = await cred(credApi.member.upiContacts, { token });
    expect(contacts[0]!.recent).toBe(true);
    expect(contacts.some((c) => c.vpa === 'aarav@mockbank' && !c.recent)).toBe(true);
    expect(contacts.some((c) => c.vpa === 'priya@mockbank')).toBe(false);

    expect(await cred(credApi.member.upiResolve, { token, query: { vpa: 'meera.joshi@mockbank' } })).toMatchObject({ valid: true, name: 'Meera Joshi' });
    expect((await cred(credApi.member.upiResolve, { token, query: { vpa: 'nobody@mockbank' } })).valid).toBe(false);

    const init = await cred(credApi.member.upiPay, { token, body: { payeeVpa: 'meera.joshi@mockbank', amountPaise: 750_00, note: 'Movie' } });
    expect(init.payment.status).toBe('awaiting_pin');
    const ref = init.pinUrl.split('/').at(-1)!;
    expect(init.pinUrl).toContain('/upi/pin/');

    const challenge = await eco(ecosystemApi.upi.challenge, { params: { upiTxnRef: ref } });
    expect(challenge).toMatchObject({ payeeName: 'Meera Joshi', amountPaise: 750_00, initiatedVia: 'CRED', attemptsLeft: 3 });
    expect(challenge.returnUrl).toBe(`http://localhost:3000/upi/${init.payment.id}`);

    const wrong = await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: '0000' } });
    expect(wrong).toMatchObject({ status: 'awaiting_pin', failureReason: 'Incorrect UPI PIN', attemptsLeft: 2 });
    const ok = await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: challenge.demoPin } });
    expect(ok.status).toBe('success');
    expect(ok.rrn).toMatch(/^\d{12}$/);

    const seen = await eventually(async () => {
      const p = (await cred(credApi.member.upiStatus, { token, params: { paymentId: init.payment.id } })).payment;
      return p.status === 'success' ? p : null;
    }, 'CRED sees UPI success');
    expect(seen.rrn).toBe(ok.rrn);
    expect((await cred(credApi.member.upiHistory, { token })).payments[0]!.id).toBe(init.payment.id);
  });

  it('not enough balance → failed with a clear reason', async () => {
    const token = await login('rohan');
    const init = await cred(credApi.member.upiPay, { token, body: { payeeVpa: 'suresh.iyer@mockbank', amountPaise: 50_000_00 } });
    const ref = init.pinUrl.split('/').at(-1)!;
    const r = await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: '1234' } });
    expect(r).toMatchObject({ status: 'failed', failureReason: 'Not enough balance in your bank account' });
    const p = await eventually(async () => {
      const x = (await cred(credApi.member.upiStatus, { token, params: { paymentId: init.payment.id } })).payment;
      return x.status === 'failed' ? x : null;
    }, 'CRED sees failure');
    expect(p.failureReason).toBe('Not enough balance in your bank account');
  });

  it('three wrong PINs fail the payment', async () => {
    const token = await login('kabir');
    const init = await cred(credApi.member.upiPay, { token, body: { payeeVpa: 'ramesh.tea@mockbank', amountPaise: 60_00 } });
    const ref = init.pinUrl.split('/').at(-1)!;
    for (const left of [2, 1]) expect((await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: '9999' } })).attemptsLeft).toBe(left);
    expect(await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: '9999' } })).toMatchObject({ status: 'failed', attemptsLeft: 0 });
  });

  it('an unknown UPI ID is refused before any money moves', async () => {
    const token = await login('aarav');
    await expect(cred(credApi.member.upiPay, { token, body: { payeeVpa: 'ghost@mockbank', amountPaise: 100_00 } })).rejects.toMatchObject({ status: 422, code: 'invalid_payee' });
  });
});

describe('rewards and cards', () => {
  it('redeeming deducts coins and returns a voucher; not enough coins is refused', async () => {
    const sneha = await login('sneha');
    const before = await cred(credApi.member.rewards, { token: sneha });
    expect(before.history.length).toBeGreaterThan(1);
    const r = await cred(credApi.member.redeemReward, { token: sneha, body: { rewardId: 'rw_shopkart_500' } });
    expect(r.balance).toBe(before.balance - 25_000);
    expect(r.voucherCode).toMatch(/^CRD-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect((await cred(credApi.member.rewards, { token: sneha })).history[0]).toMatchObject({ kind: 'redeemed', coins: -25_000 });

    const rohan = await login('rohan');
    await expect(cred(credApi.member.redeemReward, { token: rohan, body: { rewardId: 'rw_shopkart_500' } })).rejects.toMatchObject({ status: 409, code: 'not_enough_coins' });
  });

  it('card detail shows utilisation, the statement and convertible transactions; home has the rewards balance', async () => {
    const token = await login('aarav');
    const card = await firstCard(token);
    const d = await cred(credApi.member.card, { token, params: { cardId: card.id } });
    expect(d.card.utilisationBps).toBe(Math.round((card.outstandingPaise * 10_000) / card.limitPaise));
    expect(d.statement!.status).toBe('open');
    expect(d.transactions.length).toBeGreaterThan(5);
    expect(d.transactions.every((t) => t.convertible === t.amountPaise >= 5_000_00)).toBe(true);
    const home = await cred(credApi.member.home, { token });
    expect(home.rewardsCoins).toBe(48_250);
    expect(home.simDate).toBe('2026-11-02');
  });
});
