/**
 * M7: pay-down plans on the member's own card (help, not credit), EMI bounces and recovery, the staff
 * login for the console, ShopKart's UPI checkout and the lender portal.
 */
import { payDownTruth } from '@cred/engine';
import { call, credApi, ecosystemApi, personaByKey } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, buyOnShopKart, cred, eco, eventually, login, resetWorld, scenario, settle, STAFF } from './helpers';
import { E2E } from './setup';

beforeEach(resetWorld);

const me = async (token: string) => (await cred(credApi.member.home, { token })).member.id;

async function aaravWithEmi() {
  const token = await login('aarav');
  await buyOnShopKart('aarav', 1_50_000_00);
  await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'offer');
  await cred(credApi.member.grantPermission, { token, body: { scope: 'smart_savings', context: 'test', explicit: true } });
  const offer = (await cred(credApi.products.offers, { token })).active!;
  const acc = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
  await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: acc.otp.demoOtp } });
  await settle();
  return { token, loan: (await cred(credApi.products.loans, { token })).loans[0]! };
}

describe('Pay-down plan on his own card (Rohan’s help card, no lender)', () => {
  it('shows the truth in rupees; the plan is his own card, not a loan; no lender is called', async () => {
    const token = await login('rohan');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    const view = await cred(credApi.products.payDownPlan, { token });
    expect(view.eligible).toBe(true);
    // The same savings maths as the engine everywhere else
    expect(view.truth).toEqual(payDownTruth(card.outstandingPaise));
    expect(view.truth!.monthlyInterestPaise).toBe(Math.round(card.outstandingPaise * 0.035 * 1.18));
    expect(view.truth!.plans.map((p) => p.months)).toEqual([3, 6, 12]);
    for (const p of view.truth!.plans) {
      expect(p.savingPaise).toBe(view.truth!.minimumOnly.totalInterestPaise - p.totalInterestPaise);
      expect(p.savingPaise).toBeGreaterThan(0);
    }
    expect(view.truth!.minimumOnly.months).toBeGreaterThan(view.truth!.plans[2]!.months);

    // An unticked acknowledgement can't start it
    await expect(cred(credApi.products.startPayDownPlan, { token, body: { months: 12, acknowledged: false as true } })).rejects.toMatchObject({ status: 400 });
    const started = await cred(credApi.products.startPayDownPlan, { token, body: { months: 12, acknowledged: true } });
    const plan = started.plan!;
    expect(plan).toMatchObject({ status: 'active', months: 12, monthlyPaise: view.truth!.plans[2]!.monthlyPaise, startBalancePaise: card.outstandingPaise, cycles: [] });
    await settle();

    // No lender, no loan, the card untouched
    expect((await cred(credApi.products.loans, { token })).loans).toEqual([]);
    const memberId = await me(token);
    // The world was reset for this test: starting the plan called no partner at all (the next test shows the log does record calls)
    expect((await cred(credApi.admin.partnerCalls, { query: { limit: 200 } })).calls).toEqual([]);
    expect((await cred(credApi.member.cards, { token })).cards[0]!.outstandingPaise).toBe(card.outstandingPaise);
    const audit = (await cred(credApi.admin.audit, { query: { memberId, limit: 20 } })).entries.find((e) => e.action === 'pay_down_plan.created');
    expect(audit?.details).toMatchObject({ months: 12, lender: 'none' });
    expect((await cred(credApi.admin.overview)).defaults.membersOnPayDownPlans).toBe(1);
    expect((await cred(credApi.admin.members)).members.find((m) => m.id === memberId)?.payDownPlan).toMatchObject({ months: 12 });

    // No new credit while on it, whoever asks
    await buyOnShopKart('rohan', 38_500_00, 'Studio 27 4K Monitor');
    const [d] = await eventually(async () => {
      const x = (await cred(credApi.admin.decisions, { query: { memberId } })).decisions.filter((y) => y.feature === 'big_spend_support');
      return x.length ? x : null;
    }, 'decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['on_pay_down_plan'] });
    expect(d!.explanation).toMatch(/You’re on a pay-down plan/);
    expect((await cred(credApi.member.creditLadder, { token })).creditLine.shown).toBe(false);
    await expect(cred(credApi.products.startPayDownPlan, { token, body: { months: 3, acknowledged: true } })).rejects.toMatchObject({ status: 409 });
  });

  it('plan payments go through bill pay to his card bank, earn coins and start his streak; one gentle reminder per bill', async () => {
    const token = await login('rohan');
    const streakBefore = (await cred(credApi.member.creditLadder, { token })).onTimeStreak;
    await cred(credApi.products.startPayDownPlan, { token, body: { months: 12, acknowledged: true } });
    // The bill already due is paid as he can (his own habit pays the minimum); the plan starts with the next bill
    await advance(1);
    let v = (await cred(credApi.products.payDownPlan, { token })).plan!;
    expect(v.cycles).toHaveLength(1);
    expect(v.cycles[0]!.state).toBe('open');
    expect(v.nextAmountPaise).toBe(Math.min(v.monthlyPaise, v.cycles[0]!.planAmountPaise));
    const reminders = (await cred(credApi.products.alerts, { token })).alerts.filter((a) => a.kind === 'plan');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.body).toMatch(/the minimum is fine too/);
    expect(JSON.stringify(reminders)).not.toMatch(/stress|risk|blocked/i);

    // He pays the plan amount through the normal bill pay: to Mock Bank, his card's bank
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    const paid = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'custom', amountPaise: v.nextAmountPaise, source: 'upi' } });
    expect(paid.coinsEarned).toBeGreaterThan(0);
    const calls = (await cred(credApi.admin.partnerCalls, { query: { limit: 200 } })).calls;
    expect(calls.some((c) => c.partner === 'bank' && c.path.includes('card-bill-payments'))).toBe(true);
    expect(calls.filter((c) => c.partner === 'lender')).toEqual([]);
    v = (await cred(credApi.products.payDownPlan, { token })).plan!;
    expect(v.nextAmountPaise).toBe(0);

    // The due date passes: on track, and the ladder counts it like a bill paid in full
    await advance(1);
    v = (await cred(credApi.products.payDownPlan, { token })).plan!;
    expect(v.cycles[0]!.state).toBe('on_track');
    expect(v.onTrackCycles).toBe(1);
    const ladder = await cred(credApi.member.creditLadder, { token });
    expect(ladder.onTimeStreak).toBe(streakBefore + 1);
    expect(ladder.history.some((h) => h.outcome === 'on_plan')).toBe(true);
    // Still one reminder per bill, never more
    expect((await cred(credApi.products.alerts, { token })).alerts.filter((a) => a.kind === 'plan')).toHaveLength(2);
  });

  it('paying only the minimum stays his choice: no extra nudges, and he can stop the plan', async () => {
    const token = await login('rohan');
    await cred(credApi.products.startPayDownPlan, { token, body: { months: 6, acknowledged: true } });
    await advance(2); // his habit pays the minimum both months
    const v = (await cred(credApi.products.payDownPlan, { token })).plan!;
    expect(v.cycles[0]!.state).toBe('below_plan');
    expect((await cred(credApi.products.alerts, { token })).alerts.filter((a) => a.kind === 'plan')).toHaveLength(2);
    const stopped = await cred(credApi.products.stopPayDownPlan, { token });
    expect(stopped.plan).toBeNull();
    expect(stopped.eligible).toBe(true);
    const memberId = await me(token);
    expect((await cred(credApi.admin.audit, { query: { memberId, limit: 30 } })).entries.some((e) => e.action === 'pay_down_plan.stopped')).toBe(true);
    expect((await cred(credApi.admin.overview)).defaults.membersOnPayDownPlans).toBe(0);
  });
});

describe('EMI bounce (control room: cash crunch)', () => {
  it('the EMI bounces → calm notice → admin defaults and funnel reflect it → pay-now refused kindly → late salary clears it', async () => {
    const { token, loan } = await aaravWithEmi();
    const r = await eco(ecosystemApi.sim.scenario, { body: { scenario: 'cash_crunch', personaKey: 'aarav' } });
    expect(r.note).toMatch(/EMI will bounce/);
    await advance();
    const bounced = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(bounced.schedule[0]).toMatchObject({ n: 1, status: 'overdue' });
    const alert = (await cred(credApi.products.alerts, { token })).alerts.find((a) => a.title.includes('couldn’t be collected'))!;
    expect(alert.body).toMatch(/pay it now from the loan screen/);
    expect(`${alert.title} ${alert.body}`).not.toMatch(/stress|risk|blocked|default/i);

    const o = await cred(credApi.admin.overview);
    expect(o.defaults).toMatchObject({ loansWithOverdue: 1, overdueInstalments: 1, bouncesThisMonth: 1, loansOver90Days: 0 });
    expect(o.funnel.find((f) => f.feature === 'big_spend_support')).toMatchObject({ accepted: 1, acceptedNowOverdue: 1 });

    // Pay now: not enough in the account yet, said plainly
    await expect(cred(credApi.products.payOverdue, { token, params: { loanId: loan.id } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/talk to us/) });

    // The late salary lands; the lender retries and collects both EMIs
    await advance();
    const after = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(after.schedule.slice(0, 2).map((i) => i.status)).toEqual(['paid', 'paid']);
    expect((await cred(credApi.admin.overview)).defaults.loansWithOverdue).toBe(0);
  });

  it('pay now works once there is money', async () => {
    const { token, loan } = await aaravWithEmi();
    await scenario('cash_crunch', 'aarav');
    await advance();
    // A friend sends money by UPI (Sneha pays Aarav)
    const sneha = await login('sneha');
    const pay = await cred(credApi.member.upiPay, { token: sneha, body: { payeeVpa: personaByKey('aarav').vpa, amountPaise: 20_000_00 } });
    await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: pay.pinUrl.split('/').at(-1)! }, body: { pin: '1234' } });
    const paid = await cred(credApi.products.payOverdue, { token, params: { loanId: loan.id } });
    expect(paid.amountPaise).toBe(loan.emiPaise);
    await settle();
    expect((await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan.schedule[0]!.status).toBe('paid');
  });
});

describe('Console login', () => {
  it('admin endpoints need a staff session; wrong passwords are refused and logged; member tokens don’t work', async () => {
    await expect(call(E2E.credApi, credApi.admin.overview)).rejects.toMatchObject({ status: 401 });
    await expect(call(E2E.credApi, credApi.admin.login, { body: { email: STAFF.email, password: 'nope' } })).rejects.toMatchObject({ status: 401 });
    const member = await login('aarav');
    await expect(call(E2E.credApi, credApi.admin.overview, { headers: { authorization: `Bearer ${member}` } })).rejects.toMatchObject({ status: 401 });
    const ok = await call(E2E.credApi, credApi.admin.login, { body: STAFF });
    expect(ok.staff.name).toBe('Ananya Rao');
    expect(await call(E2E.credApi, credApi.admin.me, { headers: { authorization: `Bearer ${ok.token}` } })).toMatchObject({ email: STAFF.email });
    const audit = (await cred(credApi.admin.audit, { query: { limit: 20 } })).entries.map((e) => e.action);
    expect(audit).toEqual(expect.arrayContaining(['admin.login', 'admin.login_failed']));
  });
});

describe('ShopKart UPI checkout and the lender portal', () => {
  it('UPI checkout: the shopper approves on the UPI switch; the gateway marks the order paid; CRED isn’t involved', async () => {
    const aarav = personaByKey('aarav');
    const created = await eco(ecosystemApi.gateway.createPayment, {
      as: 'merchant',
      body: { orderId: `SK-UPI-${Date.now()}`, amountPaise: 2_000_00, description: 'USB-C cable', shopperPhone: aarav.phone, returnUrl: 'http://localhost:3002/order/x', instrument: { method: 'upi', vpa: aarav.vpa } },
    });
    expect(created.payment).toMatchObject({ method: 'upi', status: 'requires_authentication' });
    const ref = created.nextAction!.url.split('/').at(-1)!;
    const challenge = await eco(ecosystemApi.upi.challenge, { params: { upiTxnRef: ref } });
    expect(challenge).toMatchObject({ payeeName: 'ShopKart', initiatedVia: 'ShopKart checkout', amountPaise: 2_000_00 });
    await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: ref }, body: { pin: '1234' } });
    const p = await eco(ecosystemApi.gateway.payment, { as: 'merchant', params: { paymentId: created.payment.paymentId } });
    expect(p.payment.status).toBe('succeeded');
    const token = await login('aarav');
    expect((await cred(credApi.member.upiHistory, { token })).payments.some((x) => x.amountPaise === 2_000_00)).toBe(false);
  });

  it('blocked: UPI above ₹1 lakh fails at the gateway', async () => {
    const aarav = personaByKey('aarav');
    const created = await eco(ecosystemApi.gateway.createPayment, {
      as: 'merchant',
      body: { orderId: `SK-UPI-${Date.now()}`, amountPaise: 1_50_000_00, description: 'Aero 14', shopperPhone: aarav.phone, returnUrl: 'http://localhost:3002/order/x', instrument: { method: 'upi', vpa: aarav.vpa } },
    });
    expect(created).toMatchObject({ nextAction: null, payment: { status: 'failed', failureReason: expect.stringMatching(/1,00,000/) } });
  });

  it('lender portal shows the borrower’s loan and schedule', async () => {
    await aaravWithEmi();
    const r = await eco(ecosystemApi.lender.customerLoans, { params: { customerRef: 'per_aarav' } });
    expect(r.customerName).toBe('Aarav Mehta');
    expect(r.loans[0]).toMatchObject({ lenderName: 'Northstar Finance', kind: 'purchase_emi', status: 'disbursed' });
    expect(r.loans[0]!.schedule).toHaveLength(12);
  });
});
