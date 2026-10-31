import { averageExpenseRatioBps, defaultGoalReturnBps, portfolioTotals } from '@cred/engine';
import { catalog } from '@cred/db/seed';
import { conflict, handlers, HttpError, notFound } from '@cred/service-kit';
import { credApi, ecosystemApi, SellVsBorrow, type SessionClaims } from '@cred/types';
import { dataUpdated } from './alerts';
import type { Ctx } from './context';
import { activeRules, runSellVsBorrow } from './engine-runner';
import { toGoal, toHolding, toOffer } from './mappers';
import { ACTIVE_OFFER_STATUSES } from './snapshot';

type Auth = SessionClaims;
const GOLD = catalog.FUND_HOUSE.schemes.find((s) => s.code === catalog.GOLD_SCHEME_CODE)!;

/**
 * Wealth Management (7): tracking, goals and fees disclosed, with no product
 * attached. Wealth-Backed Liquidity (2): when the member starts selling,
 * selling vs borrowing against it, through the engine.
 */
export function wealthHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db, hub } = ctx;

  const memberHolding = async (memberId: string, id: string) => {
    const x = await db.holding.findUnique({ where: { id } });
    if (!x || x.memberId !== memberId) throw notFound('Holding');
    return x;
  };

  h.on<typeof credApi.products.holdings, Auth>(credApi.products.holdings, async ({ auth }) => {
    const [rows, consent] = await Promise.all([
      db.holding.findMany({ where: { memberId: auth.memberId }, orderBy: { valuePaise: 'desc' } }),
      db.aaConsent.findFirst({ where: { memberId: auth.memberId, purpose: 'portfolio_tracking', status: 'ACTIVE' } }),
    ]);
    const holdings = rows.map(toHolding);
    return { linked: !!consent, holdings, ...portfolioTotals(holdings), lastFetchedAt: consent?.lastFetchedAt?.toISOString() ?? null };
  });

  h.on<typeof credApi.products.holding, Auth>(credApi.products.holding, async ({ auth, params }) => ({ holding: toHolding(await memberHolding(auth.memberId, params.holdingId)) }));

  /** Gold isn't carried by Account Aggregator: the member declares it and CRED values it at today's gold price. */
  h.on<typeof credApi.products.addGold, Auth>(credApi.products.addGold, async ({ auth, body }) => {
    const n = await db.holding.count({ where: { memberId: auth.memberId, kind: 'gold' } });
    const row = await db.holding.create({
      data: {
        memberId: auth.memberId,
        kind: 'gold',
        assetClass: 'gold',
        source: 'self_declared',
        name: `Gold · ${body.grams} g`,
        provider: 'Declared by you',
        externalRef: `gold_${auth.memberId}_${n + 1}`,
        units: body.grams,
        valuePaise: Math.round(body.grams * catalog.GOLD_PRICE_PER_GRAM_PAISE),
        costPaise: body.costPaise,
        acquiredAt: body.acquiredOn,
        expectedReturnBps: GOLD.expectedReturnBps,
      },
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'holding.declared', target: row.id, details: { kind: 'gold', grams: body.grams } });
    dataUpdated(ctx, auth.memberId, 'holdings');
    return { holding: toHolding(row) };
  });

  h.on<typeof credApi.products.removeHolding, Auth>(credApi.products.removeHolding, async ({ auth, params }) => {
    const x = await memberHolding(auth.memberId, params.holdingId);
    if (x.source !== 'self_declared') throw conflict('linked_holding', 'Linked holdings update from Account Aggregator; turn off portfolio sharing to remove them');
    if (x.pledgedUnits > 0) throw conflict('pledged', 'This is pledged against a loan');
    await db.holding.delete({ where: { id: x.id } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'holding.removed', target: x.id });
    dataUpdated(ctx, auth.memberId, 'holdings');
    return { ok: true as const };
  });

  // ── Feature 2: the member starts selling ──

  h.on<typeof credApi.products.sellIntent, Auth>(credApi.products.sellIntent, async ({ auth, body }) => {
    const x = await memberHolding(auth.memberId, body.holdingId);
    const intent = await db.sellIntent.create({ data: { memberId: auth.memberId, holdingId: x.id, amountNeededPaise: body.amountNeededPaise, months: body.months, comparisonJson: '{}' } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'holding.sell_started', target: x.id, details: { amountPaise: body.amountNeededPaise, months: body.months } });
    const r = await runSellVsBorrow(ctx, auth.memberId, x, body.amountNeededPaise, body.months, intent.id);
    const view = SellVsBorrow.parse({
      intentId: intent.id,
      decisionId: r.decisionId,
      holdingId: x.id,
      holdingName: x.name,
      amountNeededPaise: body.amountNeededPaise,
      months: body.months,
      sell: r.costs.sell,
      borrow: r.costs.borrow,
      maxBorrowPaise: r.costs.maxBorrowPaise,
      loanToValueBps: r.costs.loanToValueBps,
      netBenefitPaise: r.costs.netBenefitPaise,
      recommendation: r.offerId ? 'borrow' : 'sell',
      explanation: r.decision.explanation,
      offerId: r.offerId,
      status: 'open',
    });
    await db.sellIntent.update({ where: { id: intent.id }, data: { decisionId: r.decisionId, offerId: r.offerId, comparisonJson: JSON.stringify(view) } });
    return view;
  });

  h.on<typeof credApi.products.sellIntentDetail, Auth>(credApi.products.sellIntentDetail, async ({ auth, params }) => {
    const i = await db.sellIntent.findUnique({ where: { id: params.intentId } });
    if (!i || i.memberId !== auth.memberId) throw notFound('Comparison');
    return SellVsBorrow.parse({ ...JSON.parse(i.comparisonJson), status: i.status });
  });

  /** Selling is always allowed. It goes to the institution that holds it; any borrow offer for it lapses. */
  h.on<typeof credApi.products.confirmSell, Auth>(credApi.products.confirmSell, async ({ auth, params }) => {
    const i = await db.sellIntent.findUnique({ where: { id: params.intentId }, include: { holding: true } });
    if (!i || i.memberId !== auth.memberId) throw notFound('Comparison');
    if (i.status !== 'open') throw conflict('intent_closed', `This was already ${i.status}`);
    const x = i.holding;
    const free = x.units && x.pledgedUnits ? Math.round(x.valuePaise * (1 - x.pledgedUnits / x.units)) : x.valuePaise;
    if (i.amountNeededPaise > free) throw new HttpError(422, 'units_pledged', 'Part of this is pledged against a loan and can’t be sold until it’s repaid');
    let redemptionId: string;
    let status: 'requested' | 'completed' = 'completed';
    if (x.kind === 'mutual_fund') {
      const r = await ctx.partner(ecosystemApi.fundhouse.redeem, { body: { folio: x.externalRef, schemeCode: x.schemeCode!, amountPaise: i.amountNeededPaise, clientRef: i.id } });
      redemptionId = r.redemptionRef;
      status = 'requested'; // the fund house confirms by webhook
      await db.sellIntent.update({ where: { id: i.id }, data: { redemptionRef: r.redemptionRef } });
    } else if (x.kind === 'fixed_deposit') {
      const r = await ctx.partner(ecosystemApi.bank.withdrawFd, { params: { fdRef: x.externalRef }, body: { amountPaise: i.amountNeededPaise, clientRef: i.id } });
      redemptionId = r.withdrawalRef;
      const left = x.valuePaise - i.amountNeededPaise;
      if (left > 0) await db.holding.update({ where: { id: x.id }, data: { valuePaise: left, costPaise: left } });
      else await db.holding.delete({ where: { id: x.id } });
      await db.sellIntent.update({ where: { id: i.id }, data: { status: 'sold', redemptionRef: r.withdrawalRef } }).catch(() => undefined);
    } else {
      // Gold the member holds themselves: they sell it; CRED updates what they declared
      const share = Math.max(0, 1 - i.amountNeededPaise / x.valuePaise);
      const grams = Number(((x.units ?? 0) * share).toFixed(2));
      if (grams > 0) await db.holding.update({ where: { id: x.id }, data: { units: grams, name: `Gold · ${grams} g`, valuePaise: x.valuePaise - i.amountNeededPaise, costPaise: Math.round(x.costPaise * share) } });
      else await db.holding.delete({ where: { id: x.id } });
      redemptionId = `self_${i.id}`;
      await db.sellIntent.update({ where: { id: i.id }, data: { status: 'sold', redemptionRef: redemptionId } }).catch(() => undefined);
    }
    if (i.offerId) {
      const o = await db.offer.findUnique({ where: { id: i.offerId } });
      if (o && ACTIVE_OFFER_STATUSES.includes(o.status)) {
        const lapsed = await db.offer.update({ where: { id: o.id }, data: { status: 'expired', decidedAt: new Date(), decidedSimDate: await ctx.simDate() } });
        await ctx.audit({ memberId: auth.memberId, actor: 'system', action: 'offer.expired', target: o.id, details: { reason: 'Member chose to sell' } });
        hub.member(auth.memberId, { type: 'offer.updated', data: { offer: toOffer(lapsed) } });
      }
    }
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'holding.sell_confirmed', target: x.id, details: { amountPaise: i.amountNeededPaise, kind: x.kind } });
    dataUpdated(ctx, auth.memberId, 'holdings');
    return { redemptionId, status };
  });

  // ── Goals: guidance only, fees disclosed ──

  const feeRate = async (memberId: string) => averageExpenseRatioBps(await db.holding.findMany({ where: { memberId } }));

  h.on<typeof credApi.products.goals, Auth>(credApi.products.goals, async ({ auth }) => {
    const [goals, today, fee] = await Promise.all([db.goal.findMany({ where: { memberId: auth.memberId }, orderBy: { targetDate: 'asc' } }), ctx.simDate(), feeRate(auth.memberId)]);
    return { goals: goals.map((g) => toGoal(g, today, fee)) };
  });

  h.on<typeof credApi.products.createGoal, Auth>(credApi.products.createGoal, async ({ auth, body }) => {
    const today = await ctx.simDate();
    if (body.targetDate <= today) throw new HttpError(422, 'date_in_past', 'Pick a date in the future');
    const g = await db.goal.create({ data: { memberId: auth.memberId, name: body.name, targetPaise: body.targetPaise, targetDate: body.targetDate, currentPaise: body.currentPaise, assumedReturnBps: defaultGoalReturnBps(activeRules()) } });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'goal.created', target: g.id });
    dataUpdated(ctx, auth.memberId, 'goals');
    return { goal: toGoal(g, today, await feeRate(auth.memberId)) };
  });

  h.on<typeof credApi.products.updateGoal, Auth>(credApi.products.updateGoal, async ({ auth, params, body }) => {
    const g = await db.goal.findUnique({ where: { id: params.goalId } });
    if (!g || g.memberId !== auth.memberId) throw notFound('Goal');
    const today = await ctx.simDate();
    if (body.targetDate && body.targetDate <= today) throw new HttpError(422, 'date_in_past', 'Pick a date in the future');
    const u = await db.goal.update({ where: { id: g.id }, data: body });
    dataUpdated(ctx, auth.memberId, 'goals');
    return { goal: toGoal(u, today, await feeRate(auth.memberId)) };
  });

  h.on<typeof credApi.products.deleteGoal, Auth>(credApi.products.deleteGoal, async ({ auth, params }) => {
    const g = await db.goal.findUnique({ where: { id: params.goalId } });
    if (!g || g.memberId !== auth.memberId) throw notFound('Goal');
    await db.goal.delete({ where: { id: g.id } });
    dataUpdated(ctx, auth.memberId, 'goals');
    return { ok: true as const };
  });
}
