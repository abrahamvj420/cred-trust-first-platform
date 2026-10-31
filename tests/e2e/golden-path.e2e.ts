/**
 * The golden path across real services (cred-api + ecosystem-api), plus the
 * guardrails. Each test starts from a freshly seeded world.
 */
import { cardVsEmi } from '@cred/engine';
import { credApi, ecosystemApi, personaByKey, type Offer } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { buyOnShopKart, cred, eco, eventually, login, openStream, resetWorld, signedPost } from './helpers';

const LAPTOP = 1_50_000_00;

const decisionsFor = async (memberId: string) => (await cred(credApi.admin.decisions, { query: { memberId } })).decisions;
const memberId = (key: string) => `mem_${key}`;

beforeEach(resetWorld);

describe('golden path: Aarav buys a ₹1.5L laptop on ShopKart', () => {
  it('purchase → webhook → permission once → offer → key facts → OTP → EMI schedule, all visible in admin', async () => {
    const token = await login('aarav');
    const stream = openStream(token);
    await new Promise((r) => setTimeout(r, 200)); // let the stream connect

    // 1–2. ShopKart → gateway → Mock Bank OTP → approved
    await buyOnShopKart('aarav', LAPTOP);

    // 3. Signed webhook reached CRED: transaction stored and pushed live
    await stream.waitFor('transaction.posted');
    const txns = (await cred(credApi.member.transactions, { token, query: { limit: 5 } })).transactions;
    expect(txns[0]).toMatchObject({ merchant: 'ShopKart', amountPaise: LAPTOP });

    // 4–5. No Smart Savings yet → one-tap permission card first, live over SSE
    const prompt = (await stream.waitFor('permission.prompt')) as { data: { scope: string; context: string; previewBenefitPaise: number } };
    expect(prompt.data.scope).toBe('smart_savings');
    // Same conditional wording as the offer, never an unconditional claim
    expect(prompt.data.context).toMatch(/^If you can’t clear ₹1,50,000 by the due date, an EMI saves you ₹27,714/);
    const pending = (await cred(credApi.products.offers, { token })).active!;
    expect(pending.status).toBe('awaiting_permission');

    await cred(credApi.member.grantPermission, { token, body: { scope: 'smart_savings', context: 'Your ₹1,50,000 ShopKart purchase', explicit: true } });
    await stream.waitFor('offer.created');
    const offer: Offer = (await cred(credApi.products.offers, { token })).active!;
    expect(offer.status).toBe('shown');
    expect(offer.headline).toBe(prompt.data.context);
    expect(offer.why).toMatch(/bigger than your usual spending/);

    // Card vs EMI vs loan side by side, saving from the engine's savings function
    expect(offer.options.map((o) => o.key)).toEqual(['pay_in_full', 'card_revolve', 'emi', 'loan']);
    const emi = offer.options.find((o) => o.key === 'emi')!;
    expect(emi.recommended).toBe(true);
    expect(offer.netBenefitPaise).toBe(cardVsEmi(LAPTOP, 12, emi.terms!.ratePaBps).savingPaise);
    expect(offer.netBenefitPaise).toBeGreaterThan(0);

    // 6. Key facts → accept → lender OTP → approved by webhook → EMI schedule
    const kfs = await cred(credApi.products.keyFacts, { token, params: { offerId: offer.id }, query: { option: 'emi' } });
    expect(kfs.lenderOrInsurer).toBe('Northstar Finance');
    expect(kfs.annualPercentageRateBps).toBeGreaterThan(emi.terms!.ratePaBps); // APR includes the fee
    const accepted = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
    expect(accepted.otp.sentTo).toBe('XXXXXX0001');
    await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: '654321' } });

    const loan = await eventually(async () => {
      const l = (await cred(credApi.products.loans, { token })).loans[0];
      return l?.status === 'disbursed' ? l : null;
    }, 'loan disbursed');
    expect(loan.schedule).toHaveLength(12);
    expect(loan.emiPaise).toBe(emi.terms!.emiPaise);
    expect(loan.schedule.reduce((a, i) => a + i.principalPaise, 0)).toBe(LAPTOP);
    await stream.waitFor('loan.updated');

    // 7. Admin sees transaction, decision, permission log and loan
    const adminTxns = (await cred(credApi.admin.transactions, { query: { memberId: memberId('aarav') } })).transactions;
    expect(adminTxns.some((t) => t.amountPaise === LAPTOP)).toBe(true);
    const [decision] = await decisionsFor(memberId('aarav'));
    expect(decision).toMatchObject({ feature: 'big_spend_support', outcome: 'offer', reasons: ['awaiting_permission'], offerId: offer.id });
    expect(decision!.checks.map((c) => c.check)).toEqual(['signal', 'permission', 'stress', 'offer_cap', 'affordability', 'likely_to_carry', 'net_benefit']);
    expect(decision!.explanation).toMatch(/If you can’t clear it by the due date/);
    const perms = (await cred(credApi.admin.permissionLog, { query: { memberId: memberId('aarav') } })).entries.map((e) => e.action);
    expect(perms).toEqual(expect.arrayContaining(['permission.prompted', 'permission.granted']));
    const adminLoans = (await cred(credApi.admin.loans, { query: { memberId: memberId('aarav') } })).loans;
    expect(adminLoans[0]).toMatchObject({ status: 'disbursed', lenderName: 'Northstar Finance' });

    stream.close();
  });
});

describe('guardrails', () => {
  it('Rohan (minimum-only payments) makes the same purchase: no credit, logged blocked: stress, repayment help shown', async () => {
    const token = await login('rohan');
    const stream = openStream(token);
    await new Promise((r) => setTimeout(r, 200));
    await buyOnShopKart('rohan', LAPTOP);

    const help = await stream.waitFor('help.created');
    expect(help).toBeTruthy();
    const [decision] = await eventually(async () => {
      const d = await decisionsFor(memberId('rohan'));
      return d.length ? d : null;
    }, 'Rohan decision');
    expect(decision).toMatchObject({ outcome: 'help', reasons: ['stress_signal'], offerId: null });
    expect(decision!.stressSignals).toEqual(expect.arrayContaining(['minimum_only_payments', 'high_utilisation']));

    const offers = await cred(credApi.products.offers, { token });
    expect(offers.active).toBeNull();
    expect(offers.history).toHaveLength(0);
    expect(offers.help[0]!.title).toMatch(/carrying/);
    stream.close();
  });

  it('a ₹2,000 purchase triggers no offer and is logged as no signal', async () => {
    const token = await login('kabir');
    await buyOnShopKart('kabir', 2_000_00, 'USB-C cable');
    const [decision] = await eventually(async () => {
      const d = await decisionsFor(memberId('kabir'));
      return d.length ? d : null;
    }, 'Kabir decision');
    expect(decision).toMatchObject({ outcome: 'blocked', reasons: ['no_signal'], offerId: null });
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
  });

  it('a dismissed offer never reappears; the next big purchase stays quiet', async () => {
    const token = await login('sneha'); // Smart Savings already on
    await buyOnShopKart('sneha', LAPTOP);
    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'Sneha offer');
    expect(offer.status).toBe('shown');

    await cred(credApi.products.declineOffer, { token, params: { offerId: offer.id }, body: {} });
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();

    await buyOnShopKart('sneha', 1_20_000_00, 'Studio Monitor');
    const decisions = await eventually(async () => {
      const d = await decisionsFor(memberId('sneha'));
      return d.length >= 2 ? d : null;
    }, 'second decision');
    expect(decisions[0]).toMatchObject({ outcome: 'blocked', reasons: ['recently_declined'] });

    const after = await cred(credApi.products.offers, { token });
    expect(after.active).toBeNull();
    expect(after.history.find((o) => o.id === offer.id)!.status).toBe('declined');
    await expect(cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('M3 rules end to end', () => {
  const MONITOR = 38_500_00;
  const latestTxn = async (token: string) => (await cred(credApi.member.transactions, { token, query: { limit: 1 } })).transactions[0]!;

  it('a full payer’s purchase they can clear triggers no offer (blocked: can pay in full); they can still convert it themselves', async () => {
    const token = await login('aarav');
    await buyOnShopKart('aarav', MONITOR, 'Studio 27 4K Monitor');
    const [decision] = await eventually(async () => {
      const d = await decisionsFor(memberId('aarav'));
      return d.length ? d : null;
    }, 'Aarav decision');
    expect(decision).toMatchObject({ outcome: 'blocked', reasons: ['can_pay_in_full'], offerId: null });
    expect(decision!.explanation).toMatch(/you’ll likely pay it in full/);
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
    const perms = (await cred(credApi.admin.permissionLog, { query: { memberId: memberId('aarav') } })).entries.map((e) => e.action);
    expect(perms).not.toContain('permission.prompted'); // nothing to ask about

    // Member-initiated: "Convert to EMI" on the transaction, no Smart Savings needed
    const txn = await latestTxn(token);
    expect(txn).toMatchObject({ amountPaise: MONITOR, convertible: true });
    const r = await cred(credApi.products.convertToEmi, { token, params: { transactionId: txn.id } });
    expect(r.decision).toMatchObject({ origin: 'member_initiated', outcome: 'offer' });
    expect(r.offer).toMatchObject({ status: 'shown', origin: 'member_initiated' });
    expect(r.offer!.headline).toMatch(/^If you can’t clear ₹38,500 by the due date/);
    expect(r.offer!.why).toMatch(/You asked to convert/);
    // The member's own "why" feed explains both decisions
    const mine = (await cred(credApi.products.decisions, { token })).decisions;
    expect(mine.map((d) => d.outcome)).toEqual(['offer', 'blocked']);
  });

  it('withdrawing Smart Savings stops offers immediately, and it is logged', async () => {
    const token = await login('sneha');
    await buyOnShopKart('sneha', LAPTOP);
    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'Sneha offer');

    await cred(credApi.member.withdrawPermission, { token, params: { scope: 'smart_savings' } });
    const after = await cred(credApi.products.offers, { token });
    expect(after.active).toBeNull();
    expect(after.history.find((o) => o.id === offer.id)!.status).toBe('expired');
    const actions = (await cred(credApi.admin.audit, { query: { memberId: memberId('sneha') } })).entries.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['permission.withdrawn', 'offer.expired']));

    await buyOnShopKart('sneha', 1_20_000_00, 'Studio Monitor');
    const decisions = await eventually(async () => {
      const d = await decisionsFor(memberId('sneha'));
      return d.length >= 2 ? d : null;
    }, 'second Sneha decision');
    expect(decisions[0]).toMatchObject({ outcome: 'blocked', reasons: ['no_permission'] });
    expect(decisions[0]!.explanation).toMatch(/turned Smart Savings off/);
  });

  it('"Not now" to Smart Savings is not asked again (90-day rule)', async () => {
    const token = await login('aarav');
    await buyOnShopKart('aarav', LAPTOP);
    const pending = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'permission card');
    await cred(credApi.products.declineOffer, { token, params: { offerId: pending.id }, body: { reason: 'Not now (Smart Savings)' } });

    await buyOnShopKart('aarav', 1_00_000_00, 'Aero 14 Laptop (second)');
    const decisions = await eventually(async () => {
      const d = await decisionsFor(memberId('aarav'));
      return d.length >= 2 ? d : null;
    }, 'second Aarav decision');
    expect(decisions[0]).toMatchObject({ outcome: 'blocked', reasons: ['no_permission'] });
    expect(decisions[0]!.explanation).toMatch(/won’t ask again before/);
    const prompts = (await cred(credApi.admin.permissionLog, { query: { memberId: memberId('aarav') } })).entries.filter((e) => e.action === 'permission.prompted');
    expect(prompts).toHaveLength(1);
  });

  it('admin can read every rule setting', async () => {
    const { rules, editable } = await cred(credApi.admin.rules);
    expect(editable).toBe(false);
    const byKey = Object.fromEntries(rules.map((r) => [r.key, r]));
    expect(byKey.carryRepaymentMultipleBps!.display).toBe('1.5×');
    expect(byKey.monthlyProactiveOfferCap!.value).toBe(3);
    expect(byKey.permissionReaskDays!.display).toBe('90 days');
    expect(byKey.cardInterestMonthlyBps!.display).toBe('3.5%');
  });
});

describe('webhook security', () => {
  const event = (id: string, ref: string) => ({
    id,
    type: 'bank.card.transaction.posted',
    partner: 'bank',
    occurredAt: new Date().toISOString(),
    data: {
      customerRef: 'per_priya',
      cardRef: 'cc_priya',
      transactionRef: ref,
      merchant: 'Urban Bistro',
      category: 'dining',
      amountPaise: 1_850_00,
      postedAt: new Date().toISOString(),
      outstandingPaise: 60_000_00,
      limitPaise: 2_50_000_00,
    },
  });
  const txnCount = async () => (await cred(credApi.admin.transactions, { query: { memberId: memberId('priya'), limit: 500 } })).transactions.length;

  it('a duplicate webhook is acknowledged and ignored', async () => {
    const before = await txnCount();
    const e = event('evt_dup_1', 'ch_dup_1');
    const first = await signedPost(e);
    expect(await first.json()).toEqual({ received: true, duplicate: false });
    const second = await signedPost(e);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
    expect(await txnCount()).toBe(before + 1);
    const log = (await cred(credApi.admin.webhooks, { query: { memberId: memberId('priya') } })).webhooks;
    expect(log.find((w) => w.eventId === 'evt_dup_1')!.duplicate).toBe(true);
  });

  it('a webhook with a bad signature is rejected and stores nothing', async () => {
    const before = await txnCount();
    const res = await signedPost(event('evt_forged_1', 'ch_forged_1'), { forge: true });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('bad_signature');
    expect(await txnCount()).toBe(before);
  });

  it('an unsigned partner call to the lender is refused', async () => {
    await expect(eco(ecosystemApi.lender.quote, { body: { kind: 'purchase_emi', principalPaise: LAPTOP, tenureMonths: 12, clientRef: 'x' } })).rejects.toMatchObject({ status: 401 });
  });
});

describe('platform', () => {
  it('/status is ok on both APIs and they share the sim date', async () => {
    const a = await cred(credApi.platform.status);
    const b = await eco(ecosystemApi.platform.status);
    expect(a.ok && b.ok).toBe(true);
    expect(a.simDate).toBe(b.simDate);
  });

  it('personas resolve to fictional phones', () => {
    expect(personaByKey('aarav').phone).toBe('9000000001');
  });
});
