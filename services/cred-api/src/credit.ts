import { creditLine, LADDER_TIERS, nextTier, stressSignals, tierLabel } from '@cred/engine';
import { handlers, notFound } from '@cred/service-kit';
import { credApi, CreditTier, type SessionClaims } from '@cred/types';
import { revokeConsent, startConsent } from './aa';
import type { Ctx } from './context';
import { activeRules } from './engine-runner';
import { toConsent } from './mappers';
import { buildSnapshot } from './snapshot';

type Auth = SessionClaims;

/** Earned Credit Ladder (3), Salary-Verified Credit (5) and Account Aggregator consents. */
export function creditHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  const position = async (memberId: string) => {
    const l = await db.ladderProgress.findUnique({ where: { memberId } });
    const tier = CreditTier.parse(l?.tier ?? 'starter');
    const stressed = stressSignals(await buildSnapshot(ctx, memberId), activeRules()).length > 0;
    return { tier, streak: l?.onTimeStreak ?? 0, stressed };
  };

  h.on<typeof credApi.member.creditLadder, Auth>(credApi.member.creditLadder, async ({ auth }) => {
    const { tier, streak, stressed } = await position(auth.memberId);
    const income = await db.incomeProfile.findUnique({ where: { memberId: auth.memberId } });
    const next = nextTier({ tier, onTimeStreak: streak });
    const statements = await db.statement.findMany({ where: { card: { memberId: auth.memberId } }, orderBy: { periodEnd: 'desc' }, take: 8 });
    const rank = (t: string) => LADDER_TIERS.findIndex((x) => x.tier === t);
    return {
      tier,
      onTimeStreak: streak,
      tiers: LADDER_TIERS.map((t) => ({ ...t, unlocked: rank(t.tier) <= rank(tier), current: t.tier === tier })),
      nextTierInMonths: next?.paymentsNeeded ?? null,
      nextTier: next?.tier ?? null,
      creditLine: creditLine(tier, income?.monthlyNetPaise ?? null, stressed, activeRules()),
      history: statements.map((s) => ({
        periodEnd: s.periodEnd,
        dueDate: s.dueDate,
        outcome: (s.ladderOutcome ?? 'open') as 'open',
        counted: s.ladderOutcome === 'paid_in_full',
      })),
      howItWorks: [
        'Pay a bill in full by its due date and it counts towards your streak.',
        `Each tier unlocks after that many bills in a row: ${LADDER_TIERS.slice(1).map((t) => `${tierLabel(t.tier as CreditTier)} at ${t.requiredOnTimeMonths}`).join(', ')}.`,
        'Paying part of a bill restarts the streak but keeps your tier. Missing the minimum moves you down one tier.',
        'What a tier unlocks is shown here if you ever need it. We never suggest you borrow because of it.',
      ],
    };
  });

  h.on<typeof credApi.member.income, Auth>(credApi.member.income, async ({ auth }) => {
    const { tier, stressed } = await position(auth.memberId);
    const income = await db.incomeProfile.findUnique({ where: { memberId: auth.memberId } });
    const consent = await db.aaConsent.findFirst({ where: { memberId: auth.memberId, purpose: 'income_verification' }, orderBy: { createdAt: 'desc' } });
    return {
      income: income ? { monthlyNetPaise: income.monthlyNetPaise, employer: income.employer, monthsVerified: income.monthsVerified, verifiedAt: income.verifiedAt.toISOString() } : null,
      consent: consent ? toConsent(consent) : null,
      before: creditLine(tier, null, stressed, activeRules()),
      after: income ? creditLine(tier, income.monthlyNetPaise, stressed, activeRules()) : null,
    };
  });

  h.on<typeof credApi.member.startAaConsent, Auth>(credApi.member.startAaConsent, async ({ auth, body }) => startConsent(ctx, auth.memberId, body.purpose, body.returnTo));

  h.on<typeof credApi.member.aaConsents, Auth>(credApi.member.aaConsents, async ({ auth }) => ({
    consents: (await db.aaConsent.findMany({ where: { memberId: auth.memberId, status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' } })).map(toConsent),
  }));

  h.on<typeof credApi.member.aaConsent, Auth>(credApi.member.aaConsent, async ({ auth, params }) => {
    const c = await db.aaConsent.findUnique({ where: { id: params.consentId } });
    if (!c || c.memberId !== auth.memberId) throw notFound('Consent');
    return { consent: toConsent(c), dataReady: c.status === 'ACTIVE' && !!c.lastFetchedAt, returnTo: c.returnTo };
  });

  h.on<typeof credApi.member.revokeAaConsent, Auth>(credApi.member.revokeAaConsent, async ({ auth, params }) => ({ consent: await revokeConsent(ctx, auth.memberId, params.consentId) }));
}
