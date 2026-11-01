/**
 * M6: the M5 follow-ups (car cover check, insurance_data asked only on the
 * member's move, wellness reward applied at renewal, early repayment), the
 * privacy area, complaints, the admin console and the control room's member actions.
 */
import { credApi, ecosystemApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, buyOnShopKart, cred, decideConsent, eco, eventually, login, resetWorld, scenario, settle } from './helpers';

beforeEach(resetWorld);

const me = async (token: string) => (await cred(credApi.member.home, { token })).member.id;
const decisions = async (memberId: string, feature: string) => (await cred(credApi.admin.decisions, { query: { memberId } })).decisions.filter((d) => d.feature === feature);
const auditActions = async (memberId: string) => (await cred(credApi.admin.audit, { query: { memberId, limit: 500 } })).entries.map((e) => e.action);

/** Aarav's laptop on EMI: the golden path, end to end. */
async function aaravWithEmi() {
  const token = await login('aarav');
  await buyOnShopKart('aarav', 1_50_000_00);
  await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'offer');
  await cred(credApi.member.grantPermission, { token, body: { scope: 'smart_savings', context: 'test', explicit: true } });
  const offer = (await cred(credApi.products.offers, { token })).active!;
  const acc = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
  await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: acc.otp.demoOtp } });
  await settle();
  const loan = (await cred(credApi.products.loans, { token })).loans[0]!;
  return { token, loan, offer };
}

describe('M5 follow-up: a cover check on a new car reads what was actually bought', () => {
  it('dealer sold comprehensive cover → covered, nothing suggested', async () => {
    const token = await login('priya');
    await scenario('new_vehicle', 'priya', 'comprehensive');
    const [d] = await eventually(async () => {
      const x = await decisions(await me(token), 'protection_gap');
      return x.length ? x : null;
    }, 'gap decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['already_covered'], offerId: null });
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
  });

  it('policies not linked → CRED asks what came with the car (no permission prompt), then checks what the member says', async () => {
    const token = await login('aarav');
    await scenario('new_vehicle', 'aarav', 'third_party');
    const [d] = await eventually(async () => {
      const x = await decisions(await me(token), 'protection_gap');
      return x.length ? x : null;
    }, 'gap decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['needs_data'] });
    expect(d!.explanation).toMatch(/Tell us what cover came with it/);
    const vehicle = { registration: 'KA 01 AB 1234', makeModel: 'Velocity Aura 1.2', year: 2026, idvPaise: 9_20_000_00 };
    const covered = await cred(credApi.products.declareVehicle, { token, body: { vehicle, cover: 'comprehensive' } });
    expect(covered.offerId).toBeNull();
    expect(covered.areas.find((a) => a.area === 'motor')).toMatchObject({ covered: true });
    const gap = await cred(credApi.products.declareVehicle, { token, body: { vehicle, cover: 'third_party', annualPremiumPaise: 4_031_00 } });
    expect(gap.offerId).not.toBeNull();
    const offer = (await cred(credApi.products.offer, { token, params: { offerId: gap.offerId! } })).offer;
    expect(offer).toMatchObject({ feature: 'protection_gap', origin: 'member_initiated' });
    // Asked only when the member links policies: no insurance_data permission, no prompt
    expect((await cred(credApi.member.permissions, { token })).permissions.map((p) => p.scope)).not.toContain('insurance_data');
    expect(await auditActions(await me(token))).not.toContain('permission.prompted');
  });

  it('insurance_data is granted only by the member approving a policy link on the Account Aggregator', async () => {
    const token = await login('sneha');
    await scenario('insurer_renewal', 'sneha');
    await cred(credApi.products.checkProtectionGap, { token });
    expect((await cred(credApi.member.permissions, { token })).permissions.map((p) => p.scope)).not.toContain('insurance_data');
    const start = await cred(credApi.member.startAaConsent, { token, body: { purpose: 'protection_review', returnTo: '/protect' } });
    await decideConsent(start.redirectUrl);
    const p = (await cred(credApi.member.permissions, { token })).permissions.find((x) => x.scope === 'insurance_data')!;
    expect(p).toMatchObject({ status: 'granted', context: 'Cover check via Account Aggregator' });
  });
});

describe('M5 follow-up: the wellness reward is applied at renewal', () => {
  it('the insurer renews at the discounted premium and CRED shows the saving earned', async () => {
    const token = await login('priya');
    const before = await cred(credApi.products.wellness, { token });
    expect(before).toMatchObject({ rewardSavedPaise: 0, lastRenewal: null });
    expect(before.rewardEarnedPaise).toBeGreaterThan(0);
    await advance(); // the floater renews on 25 Nov
    const after = await cred(credApi.products.wellness, { token });
    expect(after.rewardSavedPaise).toBeGreaterThan(0);
    expect(after.lastRenewal).toMatchObject({ on: '2026-11-25', premiumPaidPaise: 24_800_00 - after.rewardSavedPaise, savedPaise: after.rewardSavedPaise });
    expect(after.renewalDate).toBe('2027-11-25');
    const alert = (await cred(credApi.products.alerts, { token })).alerts.find((a) => a.title.endsWith('renewed'))!;
    expect(alert.body).toMatch(/Your activity saved you ₹/);
  });
});

describe('M5 follow-up: early repayment', () => {
  it('part, then the rest: the lender quotes charges and interest saved; confirmed by webhook', async () => {
    const { token, loan } = await aaravWithEmi();
    const q = await cred(credApi.products.prepaymentQuote, { token, params: { loanId: loan.id }, query: { amountPaise: 50_000_00 } });
    expect(q).toMatchObject({ full: false, amountPaise: 50_000_00, chargesPaise: 0, totalToPayPaise: 50_000_00 });
    expect(q.interestSavedPaise).toBeGreaterThan(0);
    expect(q.remainingInstalments).toBeLessThan(12);
    await cred(credApi.products.prepay, { token, params: { loanId: loan.id }, body: { amountPaise: 50_000_00, full: false } });
    await settle();
    const part = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(part.interestSavedPaise).toBe(q.interestSavedPaise);
    expect(part.schedule).toHaveLength(q.remainingInstalments);
    expect(part.principalOutstandingPaise).toBe(1_50_000_00 - 50_000_00);

    const full = await cred(credApi.products.prepaymentQuote, { token, params: { loanId: loan.id }, query: { full: 'true' } });
    expect(full).toMatchObject({ full: true, amountPaise: 1_00_000_00, remainingInstalments: 0, newEndDate: null });
    await cred(credApi.products.prepay, { token, params: { loanId: loan.id }, body: { full: true } });
    await settle();
    const closed = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(closed).toMatchObject({ status: 'closed', principalOutstandingPaise: 0 });
    expect(closed.interestSavedPaise).toBe(q.interestSavedPaise + full.interestSavedPaise);
    // Blocked: a closed loan can't be repaid again
    await expect(cred(credApi.products.prepaymentQuote, { token, params: { loanId: loan.id }, query: { full: 'true' } })).rejects.toMatchObject({ status: 409 });
  });

  it('blocked: a repayment the bank account can’t cover is refused by the lender, and nothing changes', async () => {
    const { token, loan } = await aaravWithEmi();
    // Aarav sends ₹2 lakh by UPI (₹3.4 lakh in the bank), leaving less than the ₹1.5 lakh outstanding
    for (let i = 0; i < 2; i++) {
      const pay = await cred(credApi.member.upiPay, { token, body: { payeeVpa: 'suresh.iyer@mockbank', amountPaise: 1_00_000_00 } });
      await eco(ecosystemApi.upi.submitPin, { params: { upiTxnRef: pay.pinUrl.split('/').at(-1)! }, body: { pin: '1234' } });
    }
    await expect(cred(credApi.products.prepay, { token, params: { loanId: loan.id }, body: { full: true } })).rejects.toMatchObject({ status: 422, code: 'insufficient_funds' });
    await settle();
    const after = (await cred(credApi.products.loan, { token, params: { loanId: loan.id } })).loan;
    expect(after).toMatchObject({ status: 'disbursed', interestSavedPaise: 0, principalOutstandingPaise: 1_50_000_00 });
  });
});

describe('Privacy area', () => {
  it('what CRED knows lists each source and permission, and what it never holds; viewing is logged', async () => {
    const token = await login('priya');
    const k = await cred(credApi.privacy.whatCredKnows, { token });
    expect(k.sections.map((s) => s.title)).toEqual(expect.arrayContaining(['About you', 'Your card and bills', 'Insurance', 'Activity', 'Family']));
    expect(k.sections.find((s) => s.title === 'Insurance')!.permission).toBe('insurance_data');
    expect(k.neverHeld.join(' ')).toMatch(/UPI PIN/);
    expect(await auditActions(await me(token))).toContain('privacy.viewed_what_cred_knows');
  });

  it('download my data returns everything CRED holds, as JSON, and is logged', async () => {
    const token = await login('sneha');
    const x = await cred(credApi.privacy.exportData, { token });
    expect(x.member.name).toBe('Sneha Kapoor');
    expect(x.holdings.length).toBeGreaterThan(0);
    expect(x.transactions.length).toBeGreaterThan(0);
    expect(x.permissions.length).toBeGreaterThan(0);
    expect(await auditActions(x.member.id)).toContain('privacy.downloaded');
  });

  it('delete my data: flows stopped at source, data deleted, loans held with partners retained and said so', async () => {
    const { token, loan } = await aaravWithEmi();
    const memberId = await me(token);
    await expect(cred(credApi.privacy.deleteData, { token, body: { confirm: 'NOPE' as 'DELETE' } })).rejects.toMatchObject({ status: 400 });
    const r = await cred(credApi.privacy.deleteData, { token, body: { confirm: 'DELETE' } });
    expect(r.deleted).toBe(true);
    expect(r.retainedForLaw.join(' ')).toMatch(/Loans taken through CRED/);
    await expect(login('aarav')).rejects.toMatchObject({ status: 404 });
    // Retained: the loan (held with the lender) and the audit trail
    expect((await cred(credApi.admin.loans, { query: { memberId } })).loans.map((l) => l.id)).toEqual([loan.id]);
    expect(await auditActions(memberId)).toContain('privacy.deleted');
    // Deleted: transactions and decisions not tied to the loan
    expect((await cred(credApi.admin.transactions, { query: { memberId } })).transactions).toEqual([]);
    expect((await cred(credApi.admin.members)).members.map((m) => m.id)).not.toContain(memberId);
  });
});

describe('Complaints', () => {
  it('member raises a concern → admin resolves with a note → the member sees it; both logged', async () => {
    const token = await login('kabir');
    const c = (await cred(credApi.products.fileComplaint, { token, body: { category: 'offer', message: 'I didn’t understand why I was offered an EMI.' } })).complaint;
    expect(c.status).toBe('open');
    const list = (await cred(credApi.admin.complaints)).complaints;
    expect(list[0]).toMatchObject({ id: c.id, memberName: 'Kabir Singh', status: 'open' });
    expect((await cred(credApi.admin.overview)).kpis.openComplaints).toBe(1);
    await cred(credApi.admin.resolveComplaint, { params: { complaintId: c.id }, body: { resolution: 'We explained the saving and the “Why am I seeing this?” note. No action needed.' } });
    expect((await cred(credApi.products.complaints, { token })).complaints[0]).toMatchObject({ status: 'resolved', resolution: expect.stringMatching(/We explained/) });
    const actions = await auditActions(await me(token));
    expect(actions).toEqual(expect.arrayContaining(['complaint.raised', 'complaint.resolved']));
  });
});

describe('Admin console', () => {
  it('overview: funnel by feature, blocked by reason, member gains and defaults', async () => {
    await aaravWithEmi();
    const kabir = await login('kabir');
    await buyOnShopKart('kabir', 2_000_00, 'USB-C cable');
    await settle();
    const o = await cred(credApi.admin.overview);
    const big = o.funnel.find((f) => f.feature === 'big_spend_support')!;
    expect(big).toMatchObject({ offers: 1, shown: 1, accepted: 1 });
    expect(big.blocked).toEqual(expect.arrayContaining([{ reason: 'no_signal', count: expect.any(Number) }]));
    expect(o.gains.find((g) => g.source === 'Accepted: big spend support')!.gainPaise).toBeGreaterThan(0);
    expect(o.kpis.memberGainsPaise).toBeGreaterThan(0);
    expect(o.defaults).toMatchObject({ activeLoans: 1, loansWithOverdue: 0, defaultRateBps: 0 });
    expect(o.defaults.membersShowingStrain).toBeGreaterThanOrEqual(1); // Rohan
    expect(kabir).toBeTruthy();
    const calls = (await cred(credApi.admin.partnerCalls, { query: { limit: 50 } })).calls;
    expect(calls.map((c) => c.partner)).toContain('lender');
    expect(calls.every((c) => c.status === 200 && c.ms >= 0)).toBe(true);
  });

  it('rules are editable live: validated, logged, and the engine uses them at once', async () => {
    await expect(cred(credApi.admin.updateRule, { params: { key: 'cardInterestMonthlyBps' }, body: { value: 9000, reason: 'test' } })).rejects.toMatchObject({ status: 422 });
    await expect(cred(credApi.admin.updateRule, { params: { key: 'partnerRateMinBps' }, body: { value: 2000, reason: 'test' } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/lowest partner rate/) });
    const r = await cred(credApi.admin.updateRule, { params: { key: 'monthlyProactiveOfferCap', }, body: { value: 0, reason: 'Pause proactive offers for the demo' } });
    expect(r.rule).toMatchObject({ value: 0, changed: true, defaultValue: 3 });
    const audit = (await cred(credApi.admin.audit, { query: { limit: 20 } })).entries.find((e) => e.action === 'rule.changed')!;
    expect(audit.details).toMatchObject({ from: 3, to: 0, reason: 'Pause proactive offers for the demo' });

    const token = await login('sneha');
    await buyOnShopKart('sneha', 1_50_000_00);
    const [d] = await eventually(async () => {
      const x = await decisions(await me(token), 'big_spend_support');
      return x.length ? x : null;
    }, 'decision');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['monthly_cap_reached'] });

    await cred(credApi.admin.resetRules, { body: { reason: 'Back to defaults' } });
    expect((await cred(credApi.admin.rules)).rules.every((x) => !x.changed)).toBe(true);
  });
});

describe('Control room: member actions (DEMO_MODE)', () => {
  it('partial bill payment for Kabir brings the switch offer; verify salary for Aarav verifies it', async () => {
    const r = await cred(credApi.platform.simMemberAction, { body: { action: 'partial_bill_payment', personaKey: 'kabir' } });
    expect(r.note).toMatch(/Paid 40%/);
    const kabir = await login('kabir');
    expect(await eventually(async () => (await cred(credApi.products.offers, { token: kabir })).active, 'switch offer')).toMatchObject({ feature: 'card_balance_switch' });

    await cred(credApi.platform.simMemberAction, { body: { action: 'verify_salary', personaKey: 'aarav' } });
    await settle();
    const aarav = await login('aarav');
    expect((await cred(credApi.member.income, { token: aarav })).income).toMatchObject({ monthlyNetPaise: 2_10_000_00 });
    expect(await eco(ecosystemApi.sim.outbox)).toMatchObject({ pending: 0 });
  });
});
