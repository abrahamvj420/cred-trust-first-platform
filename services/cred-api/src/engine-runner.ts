import { DEFAULT_RULES, evaluateBigSpend, type CardPurchaseTrigger, type DecisionDraft, type QuoteInput } from '@cred/engine';
import type { TriggerOrigin } from '@cred/types';
import { ecosystemApi } from '@cred/types';
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

/** Rule settings in force. M6 makes these editable; until then, the defaults. */
export const activeRules = () => DEFAULT_RULES;

/** Big-Spend Support for a card purchase. Every decision is saved, offer or not. */
export async function runBigSpend(
  ctx: Ctx,
  memberId: string,
  trigger: CardPurchaseTrigger,
  triggerEventId: string | null,
  origin: TriggerOrigin = 'proactive',
): Promise<{ decisionId: string; offerId: string | null }> {
  const snapshot = await buildSnapshot(ctx, memberId);
  const opts = { origin, rules: activeRules() };
  let result = evaluateBigSpend(snapshot, trigger, null, opts);
  if (result.kind === 'needs_quotes') {
    const quotes = await fetchQuotes(ctx, memberId, result.principalPaise, result.tenureMonths);
    result = evaluateBigSpend(snapshot, trigger, quotes, opts);
  }
  if (result.kind !== 'decision') throw new Error('engine asked for quotes twice');
  return persistDecision(ctx, memberId, result.decision, triggerEventId, trigger.transactionRef, snapshot.today);
}

export async function persistDecision(
  ctx: Ctx,
  memberId: string,
  d: DecisionDraft,
  triggerEventId: string | null,
  triggerRef: string,
  simDate: string,
): Promise<{ decisionId: string; offerId: string | null }> {
  let offerId: string | null = null;
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
      explanation: d.explanation,
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
        why: d.explanation,
        triggerRef,
        quoteRefsJson: JSON.stringify(o.quoteRefs),
        simDate,
      },
    });
    offerId = offer.id;
    const view = toOffer(offer);
    await ctx.audit({ memberId, actor: 'system', action: 'offer.created', target: offer.id, details: { feature: d.feature, status: o.status, netBenefitPaise: o.netBenefitPaise } });
    if (d.promptPermission) {
      // Same conditional wording as the offer itself: never an unconditional saving claim.
      const context = o.headline;
      await ctx.audit({ memberId, actor: 'system', action: 'permission.prompted', target: 'smart_savings', details: { offerId: offer.id, context, simDate } });
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
  ctx.log.info({ memberId, feature: d.feature, origin: d.origin, outcome: d.outcome, reasons: d.reasons }, 'engine decision');
  return { decisionId: decision.id, offerId };
}
