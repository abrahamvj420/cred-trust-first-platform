/**
 * M7: repayment plans (help, not credit), EMI bounces and recovery, the staff
 * login for the console, ShopKart's UPI checkout and the lender portal.
 */
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

describe('Repayment plan (Rohan’s help card)', () => {
  it('3, 6 or 12 months vs carrying it; created through the partner; tracked in Loans; no new credit while on it', async () => {
    const token = await login('rohan');
    const view = await cred(credApi.products.repaymentPlan, { token });
    expect(view.eligible).toBe(true);
    expect(view.options.map((o) => o.months)).toEqual([3, 6, 12]);
    for (const o of view.options) {
      expect(o.savingPaise).toBe(o.cardInterestPaise - o.totalInterestPaise);
      expect(o.savingPaise).toBeGreaterThan(0);
    }
    const start = await cred(credApi.products.startRepaymentPlan, { token, body: { months: 6, termsAcknowledged: true } });
    await cred(credApi.products.confirmRepaymentPlan, { token, params: { loanId: start.loanId }, body: { otp: start.otp.demoOtp } });
    await settle();
    const plan = (await cred(credApi.products.loan, { token, params: { loanId: start.loanId } })).loan;
    expect(plan).toMatchObject({ kind: 'repayment_plan', status: 'disbursed', ratePaBps: 1200, tenureMonths: 6, principalPaise: view.balancePaise });
    expect(plan.emiPaise).toBe(view.options[1]!.monthlyPaise);
    // The partner cleared the card
    expect((await cred(credApi.member.cards, { token })).cards[0]!.outstandingPaise).toBe(0);
    expect((await cred(credApi.products.repaymentPlan, { token })).activeLoanId).toBe(start.loanId);

    // No new credit while on it: a big purchase is not turned into an offer, whoever asks
    await buyOnShopKart('rohan', 60_000_00, 'Studio 27 4K Monitor');
    const [d] = await eventually(async () => {
      const x = (await cred(credApi.admin.decisions, { query: { memberId: await me(token) } })).decisions.filter((y) => y.feature === 'big_spend_support');
      return x.length ? x : null;
    }, 'decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['on_repayment_plan'] });
    expect(d!.explanation).toMatch(/You’re on a repayment plan/);
    expect((await cred(credApi.member.creditLadder, { token })).creditLine.shown).toBe(false);
    expect((await cred(credApi.admin.overview)).defaults.membersOnRepaymentPlans).toBe(1);

    // Blocked: a second plan
    await expect(cred(credApi.products.startRepaymentPlan, { token, body: { months: 3, termsAcknowledged: true } })).rejects.toMatchObject({ status: 409 });
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
