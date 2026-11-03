import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { credApi, ecosystemApi, NOTICE_VERSION, type NoticeLanguage } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, cred, eco, eventually, login, resetWorld, scenario, settle } from './helpers';

/** Every byte of both databases: "nothing stored" should hold on disk, not just through the API. */
const onDisk = (needle: string) => {
  const dir = process.env.E2E_DB_DIR!;
  return readdirSync(dir).some((f) => readFileSync(path.join(dir, f)).includes(needle));
};

const agree = async (language: NoticeLanguage = 'en') => (await cred(credApi.signup.agree, { body: { noticeVersion: NOTICE_VERSION, language, agreed: true } })).signupToken;

/** Up to and including the date of birth. */
async function toDetails(phone: string, dob = '1995-06-15', language: NoticeLanguage = 'en') {
  let t = await agree(language);
  t = (await cred(credApi.signup.phone, { body: { signupToken: t, phone } })).signupToken;
  t = (await cred(credApi.signup.otp, { body: { signupToken: t, otp: '123456' } })).signupToken;
  const r = await cred(credApi.signup.dob, { body: { signupToken: t, dob } });
  if (r.outcome !== 'adult') throw new Error('expected an adult');
  return r.signupToken;
}

async function signUp(phone: string, opts: { name?: string; language?: NoticeLanguage } = {}) {
  const signupToken = await toDetails(phone, '1995-06-15', opts.language);
  const r = await cred(credApi.signup.details, { body: { signupToken, name: opts.name ?? 'Tara Iyer', email: 'tara@example.com' } });
  return { token: r.token, member: r.member };
}

async function addCard(token: string, last4 = '6611') {
  const { redirectUrl } = await cred(credApi.signup.startCard, { token, body: { last4, network: 'visa' } });
  const linkRef = redirectUrl.split('/').at(-1)!;
  const shown = await eco(ecosystemApi.bank.cardLink, { params: { linkRef } });
  expect(shown.cardMasked).toContain(last4);
  await eco(ecosystemApi.bank.decideCardLink, { params: { linkRef }, body: { decision: 'approve', otp: '123456' } });
  await settle();
  return linkRef;
}

async function fullMember(phone = '9876512341') {
  const s = await signUp(phone);
  const status = await cred(credApi.signup.creditCheck, { token: s.token });
  expect(status.membership).toBe('full');
  await addCard(s.token);
  return s;
}

/** Laptop on ShopKart with the card the bank holds for this phone. */
async function buy(phone: string, amountPaise: number, tag: string) {
  const { cards } = await eco(ecosystemApi.gateway.savedCards, { as: 'merchant', params: { shopperPhone: phone } });
  const created = await eco(ecosystemApi.gateway.createPayment, {
    as: 'merchant',
    body: { orderId: `SK-${tag}-${Date.now()}`, amountPaise, description: 'Aero 14 Laptop', shopperPhone: phone, returnUrl: 'http://localhost:3002/order/test', instrument: { method: 'card', cardToken: cards[0]!.token } },
  });
  const authId = created.nextAction!.url.split('/').at(-1)!;
  await eco(ecosystemApi.bank.submitOtp, { params: { authId }, body: { otp: '123456' } });
  await settle();
}

describe('sign-up', () => {
  beforeEach(resetWorld);

  it('happy path: notice, phone, code, age, details, credit score, full membership, first card, home', async () => {
    const { token, member } = await signUp('9876512341');
    expect(member.personaKey).toMatch(/^new_/);
    // Until the score is checked, only sign-up is open
    expect((await cred(credApi.member.home, { token })).membership).toBe('pending');
    await expect(cred(credApi.products.loans, { token })).rejects.toMatchObject({ status: 403 });

    const status = await cred(credApi.signup.creditCheck, { token });
    expect(status.membership).toBe('full');
    expect(status.creditScore).toBeGreaterThanOrEqual(status.minScore);
    expect(status.minScore).toBe(750);
    expect(status.bureauName).toBe('Trustline Credit Bureau');
    expect(status.tips).toEqual([]);
    expect(status.hasCard).toBe(false);
    // The check runs once
    expect((await cred(credApi.signup.creditCheck, { token })).checkedAt).toBe(status.checkedAt);

    await addCard(token);
    const home = await cred(credApi.member.home, { token });
    expect(home.membership).toBe('full');
    expect(home.cards).toHaveLength(1);
    expect(home.cards[0]!.last4).toBe('6611');
    expect(home.cards[0]!.nextDue?.remainingPaise).toBeGreaterThan(0);
    expect(home.member.vpa).toMatch(/^tara\.2341@mockbank$/);
    expect(home.rewardsCoins).toBe(0);
    expect((await cred(credApi.member.creditLadder, { token })).tier).toBe('silver');
    // Declining at the bank is possible, and the card can't be added twice
    await expect(cred(credApi.signup.startCard, { token, body: { last4: '1111', network: 'visa' } })).rejects.toMatchObject({ status: 409 });
  });

  it('checks the score once, even if asked twice at the same moment', async () => {
    const { token, member } = await signUp('9876512345');
    const [a, b] = await Promise.all([cred(credApi.signup.creditCheck, { token }), cred(credApi.signup.creditCheck, { token })]);
    expect(a.creditScore).toBe(b.creditScore);
    const { entries } = await cred(credApi.admin.audit, { query: { limit: 50, memberId: member.id } });
    expect(entries.filter((e) => e.action === 'credit_score.checked')).toHaveLength(1);
    expect(entries.filter((e) => e.action === 'membership.decided')).toHaveLength(1);
  });

  it('declining at the bank adds no card, and the member can try again', async () => {
    const { token } = await signUp('9876512342');
    await cred(credApi.signup.creditCheck, { token });
    const { redirectUrl } = await cred(credApi.signup.startCard, { token, body: { last4: '6611', network: 'rupay' } });
    const r = await eco(ecosystemApi.bank.decideCardLink, { params: { linkRef: redirectUrl.split('/').at(-1)! }, body: { decision: 'reject' } });
    expect(r.returnUrl).toContain('status=rejected');
    await settle();
    expect((await cred(credApi.signup.status, { token })).hasCard).toBe(false);
    await addCard(token, '7722');
    expect((await cred(credApi.member.cards, { token })).cards[0]!.last4).toBe('7722');
  });

  it('below the score: supportive not-yet, UPI and bill pay only, no credit suggestions, even when asked', async () => {
    const phone = '9876512340';
    const { token } = await signUp(phone);
    const status = await cred(credApi.signup.creditCheck, { token });
    expect(status.membership).toBe('limited');
    expect(status.creditScore).toBeLessThan(status.minScore);
    expect(status.tips.length).toBeGreaterThan(0);
    expect(JSON.stringify(status.tips)).not.toMatch(/stress|risk|blocked/i);

    // Credit, cover and investments stay closed, whatever the app asks for
    for (const call of [
      () => cred(credApi.member.creditLadder, { token }),
      () => cred(credApi.products.holdings, { token }),
      () => cred(credApi.products.startPayDownPlan, { token, body: { months: 6, acknowledged: true } }),
      () => cred(credApi.products.policies, { token }),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403 });
    }

    // UPI works straight away
    expect((await cred(credApi.member.home, { token })).member.vpa).toContain('@mockbank');
    const { contacts } = await cred(credApi.member.upiContacts, { token });
    expect(contacts.length).toBeGreaterThan(0);

    // Bill pay: add the card, pay
    await addCard(token);
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    const paid = await cred(credApi.member.payBill, { token, params: { cardId: card.id }, body: { kind: 'minimum', source: 'upi' } });
    expect(paid.payment.amountPaise).toBeGreaterThan(0);

    // A big purchase: the engine logs why, and shows nothing
    await buy(phone, 30_000_00, 'limited');
    const offers = await cred(credApi.products.offers, { token });
    expect(offers.active).toBeNull();
    const asked = (await cred(credApi.member.transactions, { token, query: { limit: 5 } })).transactions.find((t) => t.amountPaise === 30_000_00)!;
    const r = await cred(credApi.products.convertToEmi, { token, params: { transactionId: asked.id } });
    expect(r.offer).toBeNull();
    expect(r.decision.explanation).not.toMatch(/stress|risk|blocked/i);
    const { decisions } = await cred(credApi.admin.decisions, { query: { limit: 20 } });
    expect(decisions.filter((d) => d.memberName === 'Tara Iyer' && d.reasons.includes('not_eligible')).length).toBeGreaterThan(0);
    expect((await cred(credApi.admin.members)).members.find((m) => m.name === 'Tara Iyer')).toMatchObject({ membership: 'limited' });
  });

  it('the gate follows the rule setting', async () => {
    await cred(credApi.admin.updateRule, { params: { key: 'membershipMinScore' }, body: { value: 600, reason: 'Testing the gate' } });
    const { token } = await signUp('9876512340');
    expect((await cred(credApi.signup.creditCheck, { token })).membership).toBe('full');
  });

  it('logs the notice version, language and time, shown in admin’s permission and audit logs', async () => {
    const before = Date.now();
    const signupToken = await agree('hi');
    // Logged the moment it happens, with no member yet
    const anon = (await cred(credApi.admin.permissionLog, { query: { limit: 20 } })).entries.find((e) => e.action === 'notice.agreed')!;
    expect(anon.memberId).toBeNull();
    expect(anon.details).toMatchObject({ version: NOTICE_VERSION, language: 'hi' });
    expect(Date.parse(String(anon.details.agreedAt))).toBeGreaterThanOrEqual(before - 1000);

    let t = (await cred(credApi.signup.phone, { body: { signupToken, phone: '9876512343' } })).signupToken;
    t = (await cred(credApi.signup.otp, { body: { signupToken: t, otp: '000000' } })).signupToken;
    const dob = await cred(credApi.signup.dob, { body: { signupToken: t, dob: '1990-01-01' } });
    if (dob.outcome !== 'adult') throw new Error('expected an adult');
    const { token, member } = await cred(credApi.signup.details, { body: { signupToken: dob.signupToken, name: 'Tara Iyer', email: 'tara@example.com' } });

    // Then tied to the member, in both logs and on the member's own screen
    for (const log of [credApi.admin.permissionLog, credApi.admin.audit]) {
      const e = (await cred(log, { query: { limit: 50, memberId: member.id } })).entries.find((x) => x.action === 'notice.agreed');
      expect(e?.details).toMatchObject({ version: NOTICE_VERSION, language: 'hi' });
    }
    expect((await cred(credApi.signup.status, { token })).noticeAgreement).toMatchObject({ version: NOTICE_VERSION, language: 'hi' });
    expect((await cred(credApi.privacy.exportData, { token })).signUp.noticeAgreements).toHaveLength(1);
  });

  it('agreement can’t be pre-ticked or assumed: it must be explicit, on the current notice', async () => {
    await expect(cred(credApi.signup.agree, { body: { noticeVersion: NOTICE_VERSION, language: 'en', agreed: false as true } })).rejects.toMatchObject({ status: 400 });
    await expect(cred(credApi.signup.agree, { body: { noticeVersion: 'old' as typeof NOTICE_VERSION, language: 'en', agreed: true } })).rejects.toMatchObject({ status: 400 });
    const { languages } = await cred(credApi.signup.notice);
    expect(languages.en!.agree).toBe('Agree and continue');
    expect(languages.hi!.summary).toMatch(/[ऀ-ॿ]/);
  });

  it('no member data is stored before agreement, and none is accepted without it', async () => {
    const phone = '9876555501';
    const members = (await cred(credApi.admin.members)).members.length;
    await expect(cred(credApi.signup.phone, { body: { signupToken: 'sgn.forged.sig', phone } })).rejects.toMatchObject({ status: 401 });
    await expect(cred(credApi.signup.phone, { body: { phone } as never })).rejects.toMatchObject({ status: 400 });
    expect(onDisk(phone)).toBe(false);

    // Even after agreeing, nothing personal is kept until the name and email step
    const dob = '1991-02-03';
    const signupToken = await toDetails(phone, dob);
    expect(onDisk(phone)).toBe(false);
    expect(onDisk(dob)).toBe(false);
    expect((await cred(credApi.admin.members)).members.length).toBe(members);

    // And a sign-up can't skip ahead
    const fresh = await agree();
    await expect(cred(credApi.signup.details, { body: { signupToken: fresh, name: 'Tara Iyer', email: 'tara@example.com' } })).rejects.toMatchObject({ status: 422 });
    await cred(credApi.signup.details, { body: { signupToken, name: 'Tara Iyer', email: 'tara@example.com' } });
    expect((await cred(credApi.admin.members)).members.length).toBe(members + 1);
    expect(onDisk(phone)).toBe(true); // the scan does see stored data
  });

  it('under 18: stopped politely with nothing stored, not even the agreement', async () => {
    const phone = '9876555502';
    const dob = '2012-03-04'; // 14 on the sim date
    const members = (await cred(credApi.admin.members)).members.length;
    let t = await agree();
    t = (await cred(credApi.signup.phone, { body: { signupToken: t, phone } })).signupToken;
    t = (await cred(credApi.signup.otp, { body: { signupToken: t, otp: '123456' } })).signupToken;
    expect(await cred(credApi.signup.dob, { body: { signupToken: t, dob } })).toEqual({ outcome: 'under_18' });

    expect(onDisk(phone)).toBe(false);
    expect(onDisk(dob)).toBe(false);
    expect((await cred(credApi.admin.members)).members.length).toBe(members);
    const { entries } = await cred(credApi.admin.audit, { query: { limit: 200 } });
    expect(entries.filter((e) => e.action === 'notice.agreed')).toEqual([]);
    // The token is dead: they can't carry on with it
    await expect(cred(credApi.signup.dob, { body: { signupToken: t, dob: '1990-01-01' } })).rejects.toMatchObject({ status: 401 });
  });

  it('turning 18 on the sim date counts as an adult; a day short does not', async () => {
    const dobOf = async (dob: string) => {
      let t = await agree();
      t = (await cred(credApi.signup.phone, { body: { signupToken: t, phone: '9876555503' } })).signupToken;
      t = (await cred(credApi.signup.otp, { body: { signupToken: t, otp: '123456' } })).signupToken;
      return (await cred(credApi.signup.dob, { body: { signupToken: t, dob } })).outcome;
    };
    expect(await dobOf('2008-11-02')).toBe('adult');
    expect(await dobOf('2008-11-03')).toBe('under_18');
  });

  it('a number that already has a membership signs in instead', async () => {
    let t = await agree();
    t = (await cred(credApi.signup.phone, { body: { signupToken: t, phone: '9000000001' } })).signupToken;
    await expect(cred(credApi.signup.otp, { body: { signupToken: t, otp: '123456' } })).rejects.toMatchObject({ status: 409 });
  });

  it('Smart Savings isn’t asked during sign-up; the prompt comes at the first big purchase', async () => {
    const phone = '9876512341';
    const { token, member } = await fullMember(phone);
    expect((await cred(credApi.member.permissions, { token })).permissions).toEqual([]);
    expect((await cred(credApi.member.home, { token })).smartSavingsGranted).toBe(false);
    expect((await cred(credApi.products.offers, { token })).active).toBeNull();
    const audit = (await cred(credApi.admin.audit, { query: { limit: 100, memberId: member.id } })).entries;
    expect(audit.some((e) => e.action.startsWith('permission.'))).toBe(false);

    await buy(phone, 1_50_000_00, 'golden');
    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'the offer');
    expect(offer.status).toBe('awaiting_permission');
    expect(offer.feature).toBe('big_spend_support');

    await cred(credApi.member.grantPermission, { token, body: { scope: 'smart_savings', context: offer.headline, explicit: true } });
    const shown = await eventually(async () => {
      const a = (await cred(credApi.products.offers, { token })).active;
      return a?.status === 'shown' ? a : null;
    }, 'the offer to show');
    expect(shown.options[0]!.key).toBe('pay_in_full');
    const accepted = await cred(credApi.products.acceptOffer, { token, params: { offerId: shown.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
    await cred(credApi.products.confirmOffer, { token, params: { offerId: shown.id }, body: { otp: accepted.otp!.demoOtp } });
    await settle();
    expect((await cred(credApi.products.loans, { token })).loans[0]?.status).toBe('disbursed');
  });

  it('works like any persona: control room, clock, salary, portfolio, privacy', async () => {
    const { token, member } = await fullMember();
    const key = member.personaKey;
    expect((await cred(credApi.member.personas)).personas.map((p) => p.key)).toContain(key);
    expect((await cred(credApi.member.demoLogin, { body: { personaKey: key } })).member.id).toBe(member.id);

    // Control room triggers
    await cred(credApi.platform.simMemberAction, { body: { action: 'verify_salary', personaKey: key } });
    await settle();
    expect((await cred(credApi.member.income, { token })).income?.monthlyNetPaise).toBe(1_80_000_00);
    await cred(credApi.platform.simMemberAction, { body: { action: 'link_portfolio', personaKey: key } });
    await settle();
    expect((await cred(credApi.products.holdings, { token })).holdings.length).toBeGreaterThan(0);
    await scenario('market_fall', key);
    expect((await cred(credApi.products.alerts, { token })).alerts.some((a) => a.kind === 'market_fall')).toBe(true);

    // The clock moves their bills, and their habit pays them
    const before = (await cred(credApi.member.creditLadder, { token })).onTimeStreak;
    await advance(1);
    expect((await cred(credApi.member.creditLadder, { token })).onTimeStreak).toBe(before + 1);

    // Privacy area
    const knows = await cred(credApi.privacy.whatCredKnows, { token });
    const about = JSON.stringify(knows.sections);
    expect(about).toContain('tara@example.com');
    expect(about).toContain('Credit score');
    const data = await cred(credApi.privacy.exportData, { token });
    expect(data.signUp.email).toBe('tara@example.com');
    await cred(credApi.privacy.deleteData, { token, body: { confirm: 'DELETE' } });
    expect((await cred(credApi.admin.members)).members.some((m) => m.id === member.id)).toBe(false);
    // The notice agreement stays as the record of consent, without personal data
    expect((await cred(credApi.admin.audit, { query: { limit: 100, memberId: member.id } })).entries.some((e) => e.action === 'notice.agreed')).toBe(true);
  });

  it('a new sign-up after months have passed gets statements for that date', async () => {
    await advance(2);
    const { date } = await eco(ecosystemApi.sim.clock);
    const { token } = await fullMember('9876512344');
    const card = (await cred(credApi.member.cards, { token })).cards[0]!;
    expect(card.nextDue!.dueDate >= date).toBe(true);
  });

  it('reset sign-ups removes new members, loans included, and leaves the personas', async () => {
    const phone = '9876512341';
    const { token, member } = await fullMember(phone);
    await buy(phone, 1_50_000_00, 'reset');
    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'the offer');
    await cred(credApi.member.grantPermission, { token, body: { scope: 'smart_savings', context: offer.headline, explicit: true } });
    const accepted = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'emi', keyFactsAcknowledged: true } });
    await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: accepted.otp!.demoOtp } });
    await settle();

    expect((await eco(ecosystemApi.sim.resetSignups)).removed).toBe(1);
    expect((await cred(credApi.platform.simResetSignups)).removed).toBe(1);
    expect((await cred(credApi.member.personas)).personas.map((p) => p.key)).toEqual(['aarav', 'priya', 'sneha', 'kabir', 'rohan']);
    expect((await cred(credApi.admin.members)).members.some((m) => m.id === member.id)).toBe(false);
    await expect(cred(credApi.member.home, { token })).rejects.toMatchObject({ status: 401 });
    expect((await eco(ecosystemApi.gateway.shoppers, { as: 'merchant' })).shoppers).toHaveLength(5);
    // The same number can sign up again, and personas are untouched
    await fullMember(phone);
    expect((await cred(credApi.member.home, { token: await login('aarav') })).cards).toHaveLength(1);
  });
});
