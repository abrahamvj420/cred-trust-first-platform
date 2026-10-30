import { LADDER_TIERS, loanKeyFacts } from '@cred/engine';
import { conflict, forbidden, handlers, HttpError, notFound } from '@cred/service-kit';
import { credApi, ecosystemApi, LoanTerms, type SessionClaims } from '@cred/types';
import type { Ctx } from './context';
import { toCard, toHelp, toLoan, toOffer, toPermission, toStatement, toTxn, toPayment } from './mappers';
import { ACTIVE_OFFER_STATUSES } from './snapshot';

type H = ReturnType<typeof handlers>;
type Auth = SessionClaims;

export function memberHandlers(ctx: Ctx, h: H) {
  const { db, hub } = ctx;

  const loadOffer = async (memberId: string, offerId: string) => {
    const o = await db.offer.findUnique({ where: { id: offerId } });
    if (!o || o.memberId !== memberId) throw notFound('Offer');
    return o;
  };
  const loanTermsFor = (offer: ReturnType<typeof toOffer>, option: 'emi' | 'loan') => {
    const opt = offer.options.find((x) => x.key === option);
    if (!opt?.acceptable || !opt.terms) throw new HttpError(422, 'option_unavailable', `Option ${option} is not available on this offer`);
    return LoanTerms.parse(opt.terms);
  };
  const loanWithSchedule = (id: string) => db.loan.findUniqueOrThrow({ where: { id }, include: { installments: true } });

  h.on<typeof credApi.member.home, Auth>(credApi.member.home, async ({ auth }) => {
    const m = await db.member.findUniqueOrThrow({
      where: { id: auth.memberId },
      include: { cards: { include: { statements: { orderBy: { periodEnd: 'desc' }, take: 1 } } }, permissions: true, offers: { where: { status: { in: ACTIVE_OFFER_STATUSES } }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const card = m.cards[0];
    const bill = card?.statements[0];
    return {
      member: { id: m.id, personaKey: m.personaKey as 'aarav', name: m.name, phoneMasked: `XXXXXX${m.phone.slice(-4)}`, city: m.city, memberSince: m.memberSince },
      cards: m.cards.map(toCard),
      activeOffer: m.offers[0] ? toOffer(m.offers[0]) : null,
      nextBill: bill && card ? { cardId: card.id, statementId: bill.id, totalDuePaise: Math.max(0, bill.totalDuePaise - bill.paidPaise), dueDate: bill.dueDate } : null,
      smartSavingsGranted: m.permissions.some((p) => p.scope === 'smart_savings' && p.status === 'granted'),
      rewardsCoins: 0,
    };
  });

  h.on<typeof credApi.member.cards, Auth>(credApi.member.cards, async ({ auth }) => ({
    cards: (await db.card.findMany({ where: { memberId: auth.memberId } })).map(toCard),
  }));

  h.on<typeof credApi.member.statements, Auth>(credApi.member.statements, async ({ auth, params }) => {
    const card = await db.card.findUnique({ where: { id: params.cardId } });
    if (!card || card.memberId !== auth.memberId) throw notFound('Card');
    return { statements: (await db.statement.findMany({ where: { cardId: card.id }, orderBy: { periodEnd: 'desc' } })).map(toStatement) };
  });

  h.on<typeof credApi.member.currentStatement, Auth>(credApi.member.currentStatement, async ({ auth, params }) => {
    const card = await db.card.findUnique({ where: { id: params.cardId } });
    if (!card || card.memberId !== auth.memberId) throw notFound('Card');
    const s = await db.statement.findFirst({ where: { cardId: card.id }, orderBy: { periodEnd: 'desc' }, include: { payments: true } });
    if (!s) throw notFound('Statement');
    const txns = await db.cardTransaction.findMany({ where: { cardId: card.id, postedAt: { lte: new Date(`${s.periodEnd}T23:59:59+05:30`), gte: new Date(`${s.periodStart}T00:00:00+05:30`) } }, orderBy: { postedAt: 'desc' } });
    return { ...toStatement(s), transactions: txns.map(toTxn), payments: s.payments.map(toPayment) };
  });

  h.on<typeof credApi.member.transactions, Auth>(credApi.member.transactions, async ({ auth, query }) => ({
    transactions: (await db.cardTransaction.findMany({ where: { card: { memberId: auth.memberId } }, orderBy: { postedAt: 'desc' }, take: query.limit })).map(toTxn),
  }));

  // ── Offers ──────────────────────────────────────────────────────────────────

  h.on<typeof credApi.products.offers, Auth>(credApi.products.offers, async ({ auth }) => {
    const offers = await db.offer.findMany({ where: { memberId: auth.memberId }, orderBy: { createdAt: 'desc' } });
    const active = offers.find((o) => ACTIVE_OFFER_STATUSES.includes(o.status));
    const help = await db.helpPlan.findMany({ where: { memberId: auth.memberId, dismissedAt: null }, orderBy: { createdAt: 'desc' } });
    return { active: active ? toOffer(active) : null, history: offers.filter((o) => o !== active).map(toOffer), help: help.map(toHelp) };
  });

  h.on<typeof credApi.products.offer, Auth>(credApi.products.offer, async ({ auth, params }) => ({ offer: toOffer(await loadOffer(auth.memberId, params.offerId)) }));

  h.on<typeof credApi.products.keyFacts, Auth>(credApi.products.keyFacts, async ({ auth, params, query }) => {
    const offer = toOffer(await loadOffer(auth.memberId, params.offerId));
    if (offer.status !== 'shown') throw conflict('offer_not_open', `Offer is ${offer.status}`);
    return loanKeyFacts(offer.id, query.option, loanTermsFor(offer, query.option));
  });

  h.on<typeof credApi.products.acceptOffer, Auth>(credApi.products.acceptOffer, async ({ auth, params, body }) => {
    const row = await loadOffer(auth.memberId, params.offerId);
    const offer = toOffer(row);
    if (offer.status !== 'shown') throw conflict('offer_not_open', `Offer is ${offer.status}`);
    if (await db.loan.findUnique({ where: { offerId: row.id } })) throw conflict('already_accepted', 'This offer already has an application');
    const terms = loanTermsFor(offer, body.option);
    const quoteRef = (JSON.parse(row.quoteRefsJson) as Record<string, string>)[body.option];
    if (!quoteRef) throw new HttpError(422, 'no_quote', 'No partner quote for this option');

    const member = await db.member.findUniqueOrThrow({ where: { id: auth.memberId }, include: { income: true } });
    const app = await ctx.partner(ecosystemApi.lender.apply, {
      body: {
        quoteRef,
        applicant: { name: member.name, phone: member.phone },
        verifiedMonthlyIncomePaise: member.income?.monthlyNetPaise ?? null,
        kfsAcknowledgedAt: new Date().toISOString(),
        clientRef: row.id,
      },
    });
    const loan = await db.loan.create({
      data: {
        memberId: auth.memberId,
        offerId: row.id,
        applicationRef: app.applicationRef,
        kind: terms.loanKind,
        option: body.option,
        lenderName: terms.lenderName,
        principalPaise: terms.principalPaise,
        ratePaBps: terms.ratePaBps,
        tenureMonths: terms.tenureMonths,
        emiPaise: terms.emiPaise,
        processingFeePaise: terms.processingFeePaise,
        status: 'applied',
      },
      include: { installments: true },
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'offer.key_facts_acknowledged', target: row.id, details: { option: body.option, lender: terms.lenderName } });
    return { offer, loan: toLoan(loan), otp: { sentTo: app.otpSentTo, demoOtp: app.demoOtp } };
  });

  h.on<typeof credApi.products.confirmOffer, Auth>(credApi.products.confirmOffer, async ({ auth, params, body }) => {
    const row = await loadOffer(auth.memberId, params.offerId);
    const loan = await db.loan.findUnique({ where: { offerId: row.id } });
    if (!loan) throw conflict('not_accepted', 'Accept the offer first');
    if (loan.status === 'applied') {
      await ctx.partner(ecosystemApi.lender.esign, { params: { applicationRef: loan.applicationRef }, body: { otp: body.otp } });
    }
    const simDate = await ctx.simDate();
    const updated = row.status === 'accepted' ? row : await db.offer.update({ where: { id: row.id }, data: { status: 'accepted', decidedAt: new Date(), decidedSimDate: simDate } });
    if (row.status !== 'accepted') {
      await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'offer.accepted', target: row.id, details: { option: loan.option, lender: loan.lenderName } });
      hub.member(auth.memberId, { type: 'offer.updated', data: { offer: toOffer(updated) } });
      hub.admin({ type: 'offer.updated', data: { memberId: auth.memberId, offer: toOffer(updated) } });
    }
    return { offer: toOffer(updated), loan: toLoan(await loanWithSchedule(loan.id)) };
  });

  h.on<typeof credApi.products.declineOffer, Auth>(credApi.products.declineOffer, async ({ auth, params, body }) => {
    const row = await loadOffer(auth.memberId, params.offerId);
    if (!ACTIVE_OFFER_STATUSES.includes(row.status)) return { offer: toOffer(row) };
    const updated = await db.offer.update({ where: { id: row.id }, data: { status: 'declined', decidedAt: new Date(), decidedSimDate: await ctx.simDate() } });
    if (row.status === 'awaiting_permission') {
      await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'permission.prompt_declined', target: 'smart_savings', details: { offerId: row.id } });
    }
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'offer.declined', target: row.id, details: { reason: body.reason ?? null } });
    const view = toOffer(updated);
    hub.member(auth.memberId, { type: 'offer.updated', data: { offer: view } });
    hub.admin({ type: 'offer.updated', data: { memberId: auth.memberId, offer: view } });
    return { offer: view };
  });

  h.on<typeof credApi.products.loans, Auth>(credApi.products.loans, async ({ auth }) => ({
    loans: (await db.loan.findMany({ where: { memberId: auth.memberId }, include: { installments: true }, orderBy: { createdAt: 'desc' } })).map(toLoan),
  }));

  h.on<typeof credApi.products.loan, Auth>(credApi.products.loan, async ({ auth, params }) => {
    const l = await db.loan.findUnique({ where: { id: params.loanId }, include: { installments: true } });
    if (!l || l.memberId !== auth.memberId) throw notFound('Loan');
    return { loan: toLoan(l) };
  });

  // ── Permissions ─────────────────────────────────────────────────────────────

  h.on<typeof credApi.member.permissions, Auth>(credApi.member.permissions, async ({ auth }) => ({
    permissions: (await db.permission.findMany({ where: { memberId: auth.memberId } })).map(toPermission),
  }));

  h.on<typeof credApi.member.grantPermission, Auth>(credApi.member.grantPermission, async ({ auth, body }) => {
    const now = new Date();
    const p = await db.permission.upsert({
      where: { memberId_scope: { memberId: auth.memberId, scope: body.scope } },
      update: { status: 'granted', grantedAt: now, withdrawnAt: null, context: body.context },
      create: { memberId: auth.memberId, scope: body.scope, status: 'granted', grantedAt: now, context: body.context },
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'permission.granted', target: body.scope, details: { context: body.context } });
    hub.member(auth.memberId, { type: 'permission.changed', data: { permission: toPermission(p) } });

    if (body.scope === 'smart_savings') {
      // The offer that prompted the permission is now shown.
      for (const o of await db.offer.findMany({ where: { memberId: auth.memberId, status: 'awaiting_permission' } })) {
        const shown = await db.offer.update({ where: { id: o.id }, data: { status: 'shown' } });
        await ctx.audit({ memberId: auth.memberId, actor: 'system', action: 'offer.shown', target: o.id });
        hub.member(auth.memberId, { type: 'offer.created', data: { offer: toOffer(shown) } });
        hub.admin({ type: 'offer.updated', data: { memberId: auth.memberId, offer: toOffer(shown) } });
      }
    }
    return { permission: toPermission(p) };
  });

  h.on<typeof credApi.member.withdrawPermission, Auth>(credApi.member.withdrawPermission, async ({ auth, params }) => {
    const existing = await db.permission.findUnique({ where: { memberId_scope: { memberId: auth.memberId, scope: params.scope } } });
    if (!existing) throw notFound('Permission');
    const p = await db.permission.update({ where: { id: existing.id }, data: { status: 'withdrawn', withdrawnAt: new Date() } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'permission.withdrawn', target: params.scope });
    hub.member(auth.memberId, { type: 'permission.changed', data: { permission: toPermission(p) } });
    if (params.scope === 'smart_savings') {
      // No proactive offers without permission: open ones lapse.
      await db.offer.updateMany({ where: { memberId: auth.memberId, origin: 'proactive', status: { in: ACTIVE_OFFER_STATUSES } }, data: { status: 'expired', decidedAt: new Date() } });
    }
    return { permission: toPermission(p) };
  });

  h.on<typeof credApi.member.creditLadder, Auth>(credApi.member.creditLadder, async ({ auth }) => {
    const l = await db.ladderProgress.findUnique({ where: { memberId: auth.memberId } });
    const streak = l?.onTimeStreak ?? 0;
    const next = LADDER_TIERS.find((t) => t.requiredOnTimeMonths > streak);
    return {
      tier: (l?.tier ?? 'starter') as 'starter',
      onTimeStreak: streak,
      tiers: LADDER_TIERS.map((t) => ({ ...t, unlocked: streak >= t.requiredOnTimeMonths })),
      nextTierInMonths: next ? next.requiredOnTimeMonths - streak : null,
    };
  });

  h.on<typeof credApi.platform.memberStream, Auth>(credApi.platform.memberStream, async ({ auth, reply }) => {
    const m = await db.member.findUnique({ where: { id: auth.memberId } });
    if (!m || m.deletedAt) throw forbidden('Member not active');
    hub.openMember(auth.memberId, reply);
  });

}
