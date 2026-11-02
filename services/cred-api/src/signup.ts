import { randomBytes } from 'node:crypto';
import { membershipFor } from '@cred/engine';
import { conflict, handlers, HttpError, unauthorized } from '@cred/service-kit';
import { credApi, ecosystemApi, localUrl, Membership, NOTICE, NOTICE_VERSION, NoticeLanguage, SIGNUP_KEY_PREFIX, type SessionClaims, type SignupStatus } from '@cred/types';
import type { Ctx } from './context';
import { issueSignupToken, issueToken, verifySignupToken } from './session';
import { activeRules } from './rules';

type Auth = SessionClaims;
const credAppUrl = () => process.env.CRED_APP_URL ?? localUrl('cred');

const ADULT_AGE = 18;
const SCORE_TIPS: SignupStatus['tips'] = [
  { title: 'Pay every bill by its due date', body: 'On-time payments count for more than anything else. Paying the bill here helps.' },
  { title: 'Try to pay more than the minimum', body: 'Clearing more of the bill each month brings your balance down.' },
  { title: 'Use less of your limit', body: 'Keeping your balance under about 30% of your card limit helps your score.' },
  { title: 'Hold off on new credit applications', body: 'Several applications close together can lower your score for a while.' },
];

/** Whole years between a date of birth and today. */
export function ageOn(dob: string, today: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** Sign-up. Nothing personal is written until the name and email step, by which time the notice is agreed and the person is confirmed an adult. */
export function signupHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  const openAgreement = async (token: string) => {
    const claims = verifySignupToken(token);
    const agreement = await db.noticeAgreement.findUnique({ where: { id: claims.agreementId } });
    if (!agreement) throw unauthorized('Please start again');
    if (agreement.memberId) throw conflict('already_signed_up', 'This sign-up is already complete');
    return claims;
  };

  const statusOf = async (memberId: string): Promise<SignupStatus> => {
    const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { cards: { select: { id: true } }, noticeAgreements: { orderBy: { agreedAt: 'desc' }, take: 1 } } });
    const notice = m.noticeAgreements[0];
    const membership = Membership.parse(m.membership);
    return {
      membership,
      creditScore: m.creditScore,
      minScore: activeRules().membershipMinScore,
      bureauName: m.creditBureau,
      checkedAt: m.creditCheckedAt?.toISOString() ?? null,
      hasCard: m.cards.length > 0,
      tips: membership === 'limited' ? SCORE_TIPS : [],
      noticeAgreement: notice ? { version: notice.noticeVersion, language: NoticeLanguage.parse(notice.language), agreedAt: notice.agreedAt.toISOString() } : null,
    };
  };

  h.on(credApi.signup.notice, async () => ({ version: NOTICE_VERSION as typeof NOTICE_VERSION, languages: NOTICE }));

  h.on(credApi.signup.agree, async ({ body }) => {
    const row = await db.noticeAgreement.create({ data: { noticeVersion: body.noticeVersion, language: body.language } });
    await ctx.audit({ memberId: null, actor: 'member', action: 'notice.agreed', target: row.id, details: { version: row.noticeVersion, language: row.language, agreedAt: row.agreedAt.toISOString() } });
    return { signupToken: issueSignupToken({ agreementId: row.id }) };
  });

  h.on(credApi.signup.phone, async ({ body }) => {
    const claims = await openAgreement(body.signupToken);
    return { signupToken: issueSignupToken({ agreementId: claims.agreementId, phone: body.phone }) };
  });

  /** Demo: any 6 digits are accepted. */
  h.on(credApi.signup.otp, async ({ body }) => {
    const claims = await openAgreement(body.signupToken);
    if (!claims.phone) throw new HttpError(422, 'phone_needed', 'Enter your phone number first');
    if (await db.member.findUnique({ where: { phone: claims.phone } })) {
      throw conflict('already_member', 'This number already has a membership. Sign in from the list of members.');
    }
    return { signupToken: issueSignupToken({ agreementId: claims.agreementId, phone: claims.phone, phoneVerified: true }) };
  });

  h.on(credApi.signup.dob, async ({ body }) => {
    const claims = await openAgreement(body.signupToken);
    if (!claims.phoneVerified) throw new HttpError(422, 'phone_needed', 'Confirm your phone number first');
    const today = await ctx.simDate();
    if (body.dob > today) throw new HttpError(422, 'invalid_dob', 'That date is in the future. Please check it.');
    if (ageOn(body.dob, today) < ADULT_AGE) {
      // A minor can't agree to the notice: the agreement goes too, so nothing at all is kept
      await db.auditLog.deleteMany({ where: { action: 'notice.agreed', target: claims.agreementId } });
      await db.noticeAgreement.delete({ where: { id: claims.agreementId } });
      return { outcome: 'under_18' as const };
    }
    return { outcome: 'adult' as const, signupToken: issueSignupToken({ agreementId: claims.agreementId, phone: claims.phone, phoneVerified: true, dob: body.dob }) };
  });

  h.on(credApi.signup.details, async ({ body }) => {
    const claims = await openAgreement(body.signupToken);
    if (!claims.phone || !claims.phoneVerified || !claims.dob) throw new HttpError(422, 'steps_missing', 'Please start again');
    if (await db.member.findUnique({ where: { phone: claims.phone } })) throw conflict('already_member', 'This number already has a membership. Sign in from the list of members.');
    const today = await ctx.simDate();
    const key = `${SIGNUP_KEY_PREFIX}${randomBytes(4).toString('hex')}`;
    const m = await db.member.create({
      data: {
        id: `mem_${key}`,
        personaKey: key,
        name: body.name,
        phone: claims.phone,
        email: body.email,
        dob: claims.dob,
        age: ageOn(claims.dob, today),
        city: '',
        vpa: '',
        memberSince: today,
        membership: 'pending',
        ladder: { create: { tier: 'starter', onTimeStreak: 0 } },
      },
    });
    await db.noticeAgreement.update({ where: { id: claims.agreementId }, data: { memberId: m.id } });
    await db.auditLog.updateMany({ where: { action: 'notice.agreed', target: claims.agreementId }, data: { memberId: m.id } });
    await ctx.audit({ memberId: m.id, actor: 'member', action: 'signup.completed', target: null });
    return {
      token: issueToken({ memberId: m.id, personaKey: key, issuedAt: new Date().toISOString() }),
      member: { id: m.id, personaKey: key, name: m.name, phoneMasked: `XXXXXX${m.phone.slice(-4)}`, city: m.city, memberSince: m.memberSince, vpa: m.vpa },
    };
  });

  h.on<typeof credApi.signup.status, Auth>(credApi.signup.status, async ({ auth }) => statusOf(auth.memberId));

  /** Runs once, on the consent given in the notice. Finding the UPI ID at the bank happens here too, since every membership includes UPI. */
  const checking = new Map<string, Promise<SignupStatus>>();
  h.on<typeof credApi.signup.creditCheck, Auth>(credApi.signup.creditCheck, ({ auth }) => {
    // Two requests at once (a double render, a retry) must not mean two enquiries at the bureau
    const running = checking.get(auth.memberId);
    if (running) return running;
    const run = checkCredit(auth.memberId).finally(() => checking.delete(auth.memberId));
    checking.set(auth.memberId, run);
    return run;
  });

  const checkCredit = async (memberId: string): Promise<SignupStatus> => {
    const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { noticeAgreements: { take: 1 } } });
    if (m.membership !== 'pending') return statusOf(m.id);
    const consent = m.noticeAgreements[0];
    if (!consent || !m.dob) throw conflict('no_consent', 'The notice must be agreed before the score is checked');
    const check = await ctx.partner(ecosystemApi.bureau.scoreCheck, { body: { fullName: m.name, phone: m.phone, dob: m.dob, consentRef: consent.id } });
    const bank = await ctx.partner(ecosystemApi.bank.enrol, { body: { demoKey: m.personaKey, name: m.name, phone: m.phone, dob: m.dob } });
    const rules = activeRules();
    const membership = membershipFor(check.score, rules);
    await db.member.update({ where: { id: m.id }, data: { membership, creditScore: check.score, creditBureau: check.bureauName, creditCheckedAt: new Date(check.checkedAt), vpa: bank.vpa } });
    await ctx.audit({ memberId: m.id, actor: 'partner', action: 'credit_score.checked', target: check.checkRef, details: { bureau: check.bureauName, score: check.score, consentRef: consent.id } });
    await ctx.audit({ memberId: m.id, actor: 'system', action: 'membership.decided', target: membership, details: { score: check.score, minScore: rules.membershipMinScore } });
    return statusOf(m.id);
  };

  /** A limited member can add a card too: bill pay needs one. */
  h.on<typeof credApi.signup.startCard, Auth>(credApi.signup.startCard, async ({ auth, body }) => {
    const m = await db.member.findUniqueOrThrow({ where: { id: auth.memberId }, include: { cards: { select: { id: true } } } });
    if (m.membership === 'pending') throw conflict('signup_incomplete', 'Let’s finish checking your eligibility first.');
    if (m.cards.length) throw conflict('card_exists', 'Your card is already added');
    const { customerRef } = await ctx.partner(ecosystemApi.bank.enrol, { body: { demoKey: m.personaKey, name: m.name, phone: m.phone, dob: m.dob ?? '1990-01-01' } });
    const link = await ctx.partner(ecosystemApi.bank.startCardLink, { body: { customerRef, clientRef: m.id, last4: body.last4, network: body.network, returnUrl: `${credAppUrl()}/signup/card/return` } });
    await ctx.audit({ memberId: m.id, actor: 'member', action: 'card.link_requested', target: link.linkRef, details: { last4: body.last4, network: body.network } });
    return { redirectUrl: link.approvalUrl };
  });

  h.on(credApi.platform.simResetSignups, async () => {
    const members = await db.member.findMany({ where: { personaKey: { startsWith: SIGNUP_KEY_PREFIX } }, select: { id: true } });
    const ids = members.map((m) => m.id);
    await db.$transaction([
      db.auditLog.deleteMany({ where: { OR: [{ memberId: { in: ids } }, { action: 'notice.agreed' }] } }),
      db.inboundWebhook.deleteMany({ where: { memberId: { in: ids } } }),
      db.noticeAgreement.deleteMany(),
      db.member.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await ctx.audit({ memberId: null, actor: 'admin', action: 'demo.signups_reset', target: null, details: { removed: ids.length } });
    return { removed: ids.length };
  });
}
