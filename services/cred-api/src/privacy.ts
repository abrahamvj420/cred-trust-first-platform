import { handlers, notFound } from '@cred/service-kit';
import { credApi, ecosystemApi, formatInr, type SessionClaims, type WhatCredKnows } from '@cred/types';
import { revokeConsent } from './aa';
import { dataUpdated } from './alerts';
import type { Ctx } from './context';
import { toAudit, toComplaint, toConsent, toDecision, toHolding, toLoan, toOffer, toPermission, toPolicy, toTxn } from './mappers';

type Auth = SessionClaims;

/** What CRED must keep after a deletion request, and why. Shown on the delete screen. */
export const RETAINED_FOR_LAW = [
  'Loans taken through CRED: the lender holds the loan and its repayment record, and CRED keeps the loan record for 8 years as lending rules require.',
  'Insurance policies bought through CRED: the insurer holds the policy and claims; CRED keeps a record of the sale.',
  'The audit log of what CRED did and what you allowed, kept to show we acted with your permission.',
  'Complaints you raised, kept until they are closed and for the period regulators require.',
];

/** The privacy area: what CRED knows, download, delete. Every action is logged. */
export function privacyHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on<typeof credApi.privacy.whatCredKnows, Auth>(credApi.privacy.whatCredKnows, async ({ auth }) => {
    const m = await db.member.findUniqueOrThrow({
      where: { id: auth.memberId },
      include: {
        cards: { include: { _count: { select: { transactions: true, statements: true } } } },
        income: true,
        holdings: true,
        policies: true,
        familyMembers: true,
        activitySummaries: true,
        wearableLink: true,
        ladder: true,
        goals: true,
        _count: { select: { upiTransactions: true, decisions: true, offers: true, loans: true, rewards: true, complaints: true } },
      },
    });
    const card = m.cards[0];
    const sections: WhatCredKnows['sections'] = [
      {
        title: 'About you',
        source: 'You, when you joined',
        permission: null,
        items: [
          { label: 'Name', value: m.name },
          { label: 'Phone', value: `XXXXXX${m.phone.slice(-4)}` },
          { label: 'City', value: m.city },
          { label: 'UPI ID', value: m.vpa },
        ],
      },
      {
        title: 'Your card and bills',
        source: 'Mock Bank, by secure notification each time something happens',
        permission: null,
        items: card
          ? [
              { label: 'Card', value: `${card.issuerName} •••• ${card.last4}` },
              { label: 'Limit and balance', value: `${formatInr(card.limitPaise)}, ${formatInr(card.outstandingPaise)} outstanding` },
              { label: 'Transactions', value: `${card._count.transactions} purchases` },
              { label: 'Statements', value: `${card._count.statements} bills and how you paid them` },
            ]
          : [],
      },
      {
        title: 'Payments and rewards in CRED',
        source: 'What you did in the app',
        permission: null,
        items: [
          { label: 'UPI payments', value: `${m._count.upiTransactions}` },
          { label: 'Reward entries', value: `${m._count.rewards}` },
          { label: 'Credit ladder', value: m.ladder ? `${m.ladder.tier}, ${m.ladder.onTimeStreak} in a row` : 'Starter' },
        ],
      },
      {
        title: 'Suggestions and decisions',
        source: 'CRED’s engine',
        permission: null,
        items: [
          { label: 'Decisions recorded', value: `${m._count.decisions}, each with its reason (see “Your data and decisions”)` },
          { label: 'Suggestions made', value: `${m._count.offers}` },
          { label: 'Loans through CRED', value: `${m._count.loans}` },
        ],
      },
      ...(m.income
        ? [{ title: 'Salary', source: 'Your bank, through Account Aggregator, once', permission: 'income_data' as const, items: [{ label: 'Monthly salary', value: formatInr(m.income.monthlyNetPaise) }, { label: 'Employer', value: m.income.employer }, { label: 'Months seen', value: String(m.income.monthsVerified) }] }]
        : []),
      ...(m.holdings.length
        ? [
            {
              title: 'Investments',
              source: 'Fund house and bank through Account Aggregator; gold as you told us',
              permission: m.holdings.some((x) => x.source === 'aa') ? ('portfolio_data' as const) : null,
              items: m.holdings.map((x) => ({ label: x.name, value: formatInr(x.valuePaise) })),
            },
          ]
        : []),
      ...(m.policies.length
        ? [
            {
              title: 'Insurance',
              source: 'Insurer through Account Aggregator, policies bought through CRED, and cover you told us about',
              permission: m.policies.some((x) => x.source === 'aa') ? ('insurance_data' as const) : null,
              items: m.policies.map((x) => ({ label: x.productName, value: `${formatInr(x.coverPaise)} cover · ${x.source === 'aa' ? 'linked' : x.source === 'cred_purchase' ? 'bought via CRED' : 'told by you'}` })),
            },
          ]
        : []),
      ...(m.familyMembers.length
        ? [{ title: 'Family', source: 'You', permission: null, items: m.familyMembers.map((f) => ({ label: f.name, value: `${f.relation}, ${f.age}` })) }]
        : []),
      ...(m.activitySummaries.length || m.wearableLink
        ? [
            {
              title: 'Activity',
              source: 'Your health app: one weekly summary only',
              permission: 'health_data' as const,
              items: [{ label: 'Weekly summaries', value: `${m.activitySummaries.length} (average steps, active days, score)` }],
            },
          ]
        : []),
      ...(m.goals.length ? [{ title: 'Goals', source: 'You', permission: null, items: m.goals.map((g) => ({ label: g.name, value: formatInr(g.targetPaise) })) }] : []),
    ];
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'privacy.viewed_what_cred_knows', target: null });
    return {
      sections,
      neverHeld: [
        'Your card number, CVV or card PIN',
        'Your UPI PIN or net-banking password',
        'Your bank transactions (salary verification reads them once and keeps only the result)',
        'Daily steps, heart rate or any medical record',
        'Your contacts, location or messages',
      ],
    };
  });

  h.on<typeof credApi.privacy.exportData, Auth>(credApi.privacy.exportData, async ({ auth }) => {
    const m = await db.member.findUniqueOrThrow({
      where: { id: auth.memberId },
      include: {
        permissions: true,
        aaConsents: true,
        cards: { include: { transactions: true } },
        offers: true,
        decisions: { include: { offer: { select: { id: true } } } },
        loans: { include: { installments: true } },
        holdings: true,
        policies: true,
        income: true,
        activitySummaries: true,
        audit: true,
      },
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'privacy.downloaded', target: null });
    return {
      generatedAt: new Date().toISOString(),
      member: { id: m.id, personaKey: m.personaKey as 'aarav', name: m.name, phoneMasked: `XXXXXX${m.phone.slice(-4)}`, city: m.city, memberSince: m.memberSince, vpa: m.vpa },
      permissions: m.permissions.map(toPermission),
      consents: m.aaConsents.map(toConsent),
      transactions: m.cards.flatMap((c) => c.transactions.map(toTxn)),
      offers: m.offers.map(toOffer),
      decisions: m.decisions.map(toDecision),
      loans: m.loans.map(toLoan),
      holdings: m.holdings.map(toHolding),
      policies: m.policies.map(toPolicy),
      income: m.income ? { monthlyNetPaise: m.income.monthlyNetPaise, employer: m.income.employer, monthsVerified: m.income.monthsVerified, verifiedAt: m.income.verifiedAt.toISOString() } : null,
      activity: m.activitySummaries.map(({ weekStart, avgDailySteps, activeDays, score }) => ({ weekStart, avgDailySteps, activeDays, score })),
      audit: m.audit.map(toAudit),
    };
  });

  /**
   * Delete my data: stop every flow at the source (AA consents, health app), then
   * delete what CRED holds, except what must be retained (loans and policies held
   * with partners, the audit log, complaints). The member can no longer sign in.
   */
  h.on<typeof credApi.privacy.deleteData, Auth>(credApi.privacy.deleteData, async ({ auth }) => {
    const memberId = auth.memberId;
    for (const c of await db.aaConsent.findMany({ where: { memberId, status: { in: ['ACTIVE', 'PENDING'] } } })) await revokeConsent(ctx, memberId, c.id, 'system');
    const link = await db.wearableLink.findUnique({ where: { memberId } });
    if (link) await ctx.partner(ecosystemApi.wearable.unlink, { params: { linkRef: link.linkRef } }).catch(() => undefined);

    const keepLoans = await db.loan.findMany({ where: { memberId }, select: { offerId: true } });
    const keepPolicies = await db.insurancePolicy.findMany({ where: { memberId, source: 'cred_purchase' }, select: { offerId: true } });
    const keepOfferIds = [...keepLoans, ...keepPolicies].map((x) => x.offerId).filter((x): x is string => !!x);
    const counts = await db.$transaction([
      db.card.deleteMany({ where: { memberId } }),
      db.upiTransaction.deleteMany({ where: { memberId } }),
      db.permission.deleteMany({ where: { memberId } }),
      db.aaConsent.deleteMany({ where: { memberId } }),
      db.incomeProfile.deleteMany({ where: { memberId } }),
      db.sellIntent.deleteMany({ where: { memberId } }),
      db.holding.deleteMany({ where: { memberId } }),
      db.goal.deleteMany({ where: { memberId } }),
      db.familyMember.deleteMany({ where: { memberId } }),
      db.insurancePolicy.deleteMany({ where: { memberId, source: { not: 'cred_purchase' } } }),
      db.activitySummary.deleteMany({ where: { memberId } }),
      db.wearableLink.deleteMany({ where: { memberId } }),
      db.ladderProgress.deleteMany({ where: { memberId } }),
      db.helpPlan.deleteMany({ where: { memberId } }),
      db.offer.deleteMany({ where: { memberId, id: { notIn: keepOfferIds } } }),
      db.engineDecision.deleteMany({ where: { memberId, offer: null } }),
      db.domainEvent.deleteMany({ where: { memberId } }),
      db.rewardEntry.deleteMany({ where: { memberId } }),
      db.memberAlert.deleteMany({ where: { memberId } }),
      db.member.update({ where: { id: memberId }, data: { deletedAt: new Date(), name: 'Deleted member', phone: `deleted_${memberId}`, city: '', vpa: '' } }),
    ]);
    const deleted = counts.slice(0, -1).reduce((a, c) => a + (c as { count: number }).count, 0);
    const retainedForLaw = RETAINED_FOR_LAW.filter((_, i) => (i === 0 ? keepLoans.length > 0 : i === 1 ? keepPolicies.length > 0 : true));
    await ctx.audit({ memberId, actor: 'member', action: 'privacy.deleted', target: null, details: { recordsDeleted: deleted, loansRetained: keepLoans.length, policiesRetained: keepPolicies.length } });
    return { deleted: true as const, retainedForLaw };
  });

  // ── Complaints ──

  h.on<typeof credApi.products.complaints, Auth>(credApi.products.complaints, async ({ auth }) => ({
    complaints: (await db.complaint.findMany({ where: { memberId: auth.memberId }, orderBy: { createdAt: 'desc' } })).map(toComplaint),
  }));

  h.on<typeof credApi.products.fileComplaint, Auth>(credApi.products.fileComplaint, async ({ auth, body }) => {
    if (body.offerId) {
      const o = await db.offer.findUnique({ where: { id: body.offerId } });
      if (!o || o.memberId !== auth.memberId) throw notFound('Offer');
    }
    const c = await db.complaint.create({ data: { memberId: auth.memberId, category: body.category, message: body.message, offerId: body.offerId ?? null } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'complaint.raised', target: c.id, details: { category: body.category } });
    dataUpdated(ctx, auth.memberId, 'complaints');
    return { complaint: toComplaint(c) };
  });
}
