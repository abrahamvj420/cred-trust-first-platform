import { evaluateBigSpend, type CardPurchaseTrigger, type DecisionDraft, type QuoteInput } from '@cred/engine';
import { ecosystemApi, formatInr } from '@cred/types';
import type { Ctx } from './context';
import { toDecision, toHelp, toOffer } from './mappers';
import { buildSnapshot } from './snapshot';

/** Indicative, anonymous quotes from both partner lenders. A failing lender is skipped. */
async function fetchQuotes(ctx: Ctx, memberId: string, principalPaise: number, tenureMonths: number): Promise<QuoteInput[]> {
  const kinds = ['purchase_emi', 'personal_loan'] as const;
  const results = await Promise.allSettled(
    kinds.map((kind) => ctx.partner(ecosystemApi.lender.quote, { body: { kind, principalPaise, tenureMonths, clientRef: memberId } })),
  );
  return results.flatMap((r) => {
    if (r.status === 'rejected') {
      ctx.log.warn({ err: String(r.reason) }, 'lender quote failed');
      return [];
    }
    const q = r.value;
    return [{ quoteRef: q.quoteRef, lenderName: q.lenderName, kind: q.kind as QuoteInput['kind'], principalPaise: q.principalPaise, tenureMonths: q.tenureMonths, ratePaBps: q.ratePaBps, feeBps: q.feeBps }];
  });
}

/** Big-Spend Support for a posted card purchase. Every decision is saved, offer or not. */
export async function runBigSpend(ctx: Ctx, memberId: string, trigger: CardPurchaseTrigger, triggerEventId: string): Promise<void> {
  const snapshot = await buildSnapshot(ctx, memberId);
  let result = evaluateBigSpend(snapshot, trigger, null);
  if (result.kind === 'needs_quotes') {
    const quotes = await fetchQuotes(ctx, memberId, result.principalPaise, result.tenureMonths);
    result = evaluateBigSpend(snapshot, trigger, quotes);
  }
  if (result.kind !== 'decision') throw new Error('engine asked for quotes twice');
  await persistDecision(ctx, memberId, result.decision, triggerEventId, trigger.transactionRef, snapshot.today);
}

export async function persistDecision(ctx: Ctx, memberId: string, d: DecisionDraft, triggerEventId: string, triggerRef: string, simDate: string): Promise<void> {
  const { db, hub } = ctx;
  const decision = await db.engineDecision.create({
    data: {
      memberId,
      feature: d.feature,
      origin: d.origin,
      triggerEventId,
      outcome: d.outcome,
      reasonsJson: JSON.stringify(d.reasons),
      checksJson: JSON.stringify(d.checks),
      stressJson: JSON.stringify(d.stressSignals),
      netBenefitPaise: d.netBenefitPaise,
      simDate,
    },
  });

  if (d.offer) {
    const o = d.offer;
    const offer = await db.offer.create({
      data: {
        memberId,
        decisionId: decision.id,
        feature: d.feature,
        origin: d.origin,
        status: o.status,
        headline: o.headline,
        subline: o.subline,
        netBenefitPaise: o.netBenefitPaise,
        comparisonJson: JSON.stringify(o.comparison),
        optionsJson: JSON.stringify(o.options),
        termsJson: JSON.stringify(o.terms),
        triggerJson: JSON.stringify(o.trigger),
        triggerRef,
        quoteRefsJson: JSON.stringify(o.quoteRefs),
        simDate,
      },
    });
    const view = toOffer(offer);
    await ctx.audit({ memberId, actor: 'system', action: 'offer.created', target: offer.id, details: { feature: d.feature, status: o.status, netBenefitPaise: o.netBenefitPaise } });
    if (d.promptPermission) {
      const context = o.trigger ? `Your ${formatInr(o.trigger.amountPaise)} ${o.trigger.merchant} purchase` : o.headline;
      await ctx.audit({ memberId, actor: 'system', action: 'permission.prompted', target: 'smart_savings', details: { offerId: offer.id, context } });
      hub.member(memberId, { type: 'permission.prompt', data: { scope: 'smart_savings', context, previewBenefitPaise: o.netBenefitPaise } });
    } else {
      hub.member(memberId, { type: 'offer.created', data: { offer: view } });
    }
    hub.admin({ type: 'offer.updated', data: { memberId, offer: view } });
  }

  if (d.help) {
    const help = await db.helpPlan.create({
      data: { memberId, decisionId: decision.id, kind: d.help.kind, title: d.help.title, body: d.help.body, monthlyInterestPaise: d.help.monthlyInterestPaise, simDate },
    });
    hub.member(memberId, { type: 'help.created', data: { help: toHelp(help) } });
  }

  const full = await db.engineDecision.findUniqueOrThrow({ where: { id: decision.id }, include: { offer: { select: { id: true } } } });
  hub.admin({ type: 'decision.recorded', data: { decision: toDecision(full) } });
  ctx.log.info({ memberId, feature: d.feature, outcome: d.outcome, reasons: d.reasons }, 'engine decision');
}
