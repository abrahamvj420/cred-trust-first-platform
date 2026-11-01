import {
  assessGap,
  Decision,
  evaluateBalanceSwitch,
  evaluateBigSpend,
  evaluateFloater,
  evaluateLadderChange,
  evaluateProtectionGap,
  evaluateSellVsBorrow,
  floaterComparisonView,
  floaterPlan,
  loanToValueBps,
  sellVsBorrowCosts,
  type CardPurchaseTrigger,
  type CoverOption,
  type CoverPolicy,
  type DecisionDraft,
  type ExistingFloater,
  type FamilyPerson,
  type GapFocus,
  type HoldingInput,
  type LadderPosition,
  type LadderStep,
  type PartialPaymentTrigger,
  type QuoteInput,
  type QuotedPolicy,
  type SellVsBorrowCosts,
} from '@cred/engine';
import { ecosystemApi, PolicyKind, Relation, type EndpointBodyInput, type InsuranceTerms, type LoanKind, type ProtectionGap, type TriggerOrigin } from '@cred/types';
import type { Holding as HoldingRow } from '@cred/db/cred';
import { refreshFromAa } from './aa';
import { raiseAlert } from './alerts';
import { activeRules } from './rules';
import type { Ctx } from './context';
import { toDecision, toHelp, toOffer } from './mappers';
import { buildSnapshot } from './snapshot';


type Result = { decisionId: string; offerId: string | null; decision: DecisionDraft };

export { activeRules };

/** Indicative, anonymous quotes. A failing lender is skipped. */
async function fetchQuotes(ctx: Ctx, memberId: string, kinds: LoanKind[], principalPaise: number, tenureMonths: number, incomeVerified: boolean): Promise<QuoteInput[]> {
  const results = await Promise.allSettled(
    kinds.map((kind) => ctx.partner(ecosystemApi.lender.quote, { body: { kind, principalPaise, tenureMonths, incomeVerified, clientRef: memberId } })),
  );
  return results.flatMap((r) => {
    if (r.status === 'rejected') {
      ctx.log.warn({ err: String(r.reason) }, 'lender quote failed');
      return [];
    }
    const q = r.value;
    return [{ quoteRef: q.quoteRef, lenderName: q.lenderName, kind: q.kind, principalPaise: q.principalPaise, tenureMonths: q.tenureMonths, ratePaBps: q.ratePaBps, feeBps: q.feeBps, ...(q.rateStepDown ? { rateStepDown: q.rateStepDown } : {}) }];
  });
}

// ── Feature 1: Big-Spend Support ─────────────────────────────────────────────

/** Big-Spend Support for a card purchase. Every decision is saved, offer or not. */
export async function runBigSpend(ctx: Ctx, memberId: string, trigger: CardPurchaseTrigger, triggerEventId: string | null, origin: TriggerOrigin = 'proactive'): Promise<Result> {
  const snapshot = await buildSnapshot(ctx, memberId);
  const opts = { origin, rules: activeRules() };
  let result = evaluateBigSpend(snapshot, trigger, null, opts);
  if (result.kind === 'needs_quotes') {
    const quotes = await fetchQuotes(ctx, memberId, ['purchase_emi', 'personal_loan'], result.principalPaise, result.tenureMonths, snapshot.verifiedMonthlyIncomePaise !== null);
    result = evaluateBigSpend(snapshot, trigger, quotes, opts);
  }
  if (result.kind !== 'decision') throw new Error('engine asked for quotes twice');
  return persistDecision(ctx, memberId, result.decision, triggerEventId, trigger.transactionRef, snapshot.today);
}

// ── Feature 8: Card-Balance Switch ───────────────────────────────────────────

export async function runBalanceSwitch(ctx: Ctx, memberId: string, trigger: PartialPaymentTrigger): Promise<Result> {
  const s = await buildSnapshot(ctx, memberId);
  const rules = activeRules();
  let r = evaluateBalanceSwitch(s, trigger, null, { rules });
  if (r.kind === 'needs_quotes') {
    const quotes = await fetchQuotes(ctx, memberId, ['balance_switch_emi'], r.principalPaise, r.tenureMonths, s.verifiedMonthlyIncomePaise !== null);
    r = evaluateBalanceSwitch(s, trigger, quotes, { rules });
  }
  if (r.kind !== 'decision') throw new Error('engine asked for quotes twice');
  return persistDecision(ctx, memberId, r.decision, null, trigger.statementRef, s.today);
}

// ── Feature 2: Wealth-Backed Liquidity ───────────────────────────────────────

export function holdingInput(h: HoldingRow): HoldingInput {
  const perUnit = h.units ? h.valuePaise / h.units : 0;
  return {
    id: h.id,
    name: h.name,
    kind: h.kind as HoldingInput['kind'],
    assetClass: h.assetClass as HoldingInput['assetClass'],
    valuePaise: h.valuePaise,
    costPaise: h.costPaise,
    acquiredAt: h.acquiredAt,
    expectedReturnBps: h.expectedReturnBps,
    pledgedPaise: Math.round(h.pledgedUnits * perUnit),
  };
}

export async function runSellVsBorrow(ctx: Ctx, memberId: string, h: HoldingRow, amountPaise: number, months: number, intentId: string): Promise<Result & { costs: SellVsBorrowCosts }> {
  const s = await buildSnapshot(ctx, memberId);
  const rules = activeRules();
  const req = { holding: holdingInput(h), amountPaise, months };
  let quote: QuoteInput | null = null;
  let r = evaluateSellVsBorrow(s, req, null, { rules });
  if (r.kind === 'needs_quotes') {
    quote = (await fetchQuotes(ctx, memberId, ['loan_against_funds'], r.principalPaise, r.tenureMonths, s.verifiedMonthlyIncomePaise !== null))[0] ?? null;
    r = quote ? evaluateSellVsBorrow(s, req, quote, { rules }) : r;
  }
  let decision: DecisionDraft;
  if (r.kind === 'decision') decision = r.decision;
  else {
    // No lender could price it: record that; selling stays available
    const stop = new Decision('wealth_backed_liquidity', 'member_initiated').stop('net_benefit', 'not_eligible', 'No partner quote for a loan against holdings.', 'Our lending partner couldn’t give a price just now, so here’s what selling would cost.');
    if (stop.kind !== 'decision') throw new Error('unreachable');
    decision = stop.decision;
  }
  if (decision.offer) {
    // What the lender will hold: enough units (at CRED's own, stricter loan-to-value) to cover the loan
    const ltv = loanToValueBps(req.holding.assetClass, rules) / 10_000;
    const perUnit = h.units ? h.valuePaise / h.units : null;
    const pledgeValue = Math.ceil(amountPaise / ltv);
    // Round units up (to 3 decimals) so the pledge never falls a fraction short of the lender's cap
    const units = perUnit ? Math.min(h.units! - h.pledgedUnits, Math.ceil((pledgeValue / perUnit) * 1000) / 1000) : null;
    decision.offer.context = {
      ...decision.offer.context,
      intentId,
      collateral: { kind: h.kind, ref: h.externalRef, schemeCode: h.schemeCode, units, valuePaise: perUnit && units ? Math.round(units * perUnit) : h.valuePaise },
      collateralLabel: `${units ? `${units.toLocaleString('en-IN')} units of ` : ''}${h.name}`,
    };
  }
  const saved = await persistDecision(ctx, memberId, decision, null, `sell:${intentId}`, s.today);
  return { ...saved, costs: sellVsBorrowCosts(req, s.today, quote, rules) };
}

// ── Insurance quotes (features 4, 6) ─────────────────────────────────────────

type InsurerQuoteBody = EndpointBodyInput<typeof ecosystemApi.insurer.quote>;

async function insurerQuote(ctx: Ctx, body: InsurerQuoteBody): Promise<QuotedPolicy> {
  const q = await ctx.partner(ecosystemApi.insurer.quote, { body });
  const terms: InsuranceTerms = {
    kind: 'insurance',
    productKind: q.kind,
    insurerName: q.insurerName,
    productName: q.productName,
    coverPaise: q.coverPaise,
    deductiblePaise: q.deductiblePaise,
    annualPremiumPaise: q.annualPremiumPaise,
    gstPaise: q.gstPaise,
    members: q.members,
    waitingPeriods: q.waitingPeriods,
    vehicle: q.vehicle,
    wellnessRewardMaxPct: q.wellnessRewardMaxPct,
    freeLookDays: q.freeLookDays,
  };
  return { quoteRef: q.quoteRef, terms };
}

const LAKH = 1_00_000_00;
const lakhs = (paise: number) => `₹${Number((paise / LAKH).toFixed(1))} lakh`;

/** Ages for the relations a policy covers, from what the member told CRED. */
async function agesFor(ctx: Ctx, memberId: string, relations: Relation[]): Promise<{ relation: Relation; age: number; name: string }[]> {
  const m = await ctx.db.member.findUniqueOrThrow({ where: { id: memberId }, include: { familyMembers: true } });
  const pool = [...m.familyMembers];
  return relations.map((relation) => {
    if (relation === 'self') return { relation, age: m.age, name: m.name };
    const i = pool.findIndex((f) => f.relation === relation);
    const f = i >= 0 ? pool.splice(i, 1)[0]! : null;
    return { relation, age: f?.age ?? (relation === 'child' ? 8 : relation === 'spouse' ? m.age : m.age + 28), name: f?.name ?? relation };
  });
}

/** Feature 4: the member asks to cover family members; two ways compared from the insurer's own prices. */
export async function runFloater(ctx: Ctx, memberId: string, people: FamilyPerson[], coverPaise: number) {
  const s = await buildSnapshot(ctx, memberId);
  const rules = activeRules();
  const policies = await ctx.db.insurancePolicy.findMany({ where: { memberId, status: 'active', kind: 'health_family_floater', isEmployer: false } });
  const own = policies.find((p) => (JSON.parse(p.membersCoveredJson) as Relation[]).includes('self'));
  const existing: ExistingFloater | null = own
    ? { policyRef: own.externalRef, productName: own.productName, coverPaise: own.coverPaise, annualPremiumPaise: own.annualPremiumPaise, members: JSON.parse(own.membersCoveredJson) }
    : null;
  const plan = floaterPlan(people, existing);
  const req = { people: plan.uncovered.length ? plan.uncovered : people, coverPaise, existing, structure: plan.structure };
  let r = evaluateFloater(s, req, null, { rules });
  let options: CoverOption[] = [];
  const insured: Record<string, { name: string; relation: Relation; age: number }[]> = {};
  if (r.kind === 'needs_quotes') {
    const ages = (ps: { relation: Relation; age: number }[]) => ps.map(({ relation, age }) => ({ relation, age }));
    if (plan.structure === 'add_vs_separate' && existing) {
      const current = await agesFor(ctx, memberId, existing.members);
      const all = [...current, ...req.people];
      const [together, separate] = await Promise.all([
        insurerQuote(ctx, { product: 'family_floater', members: ages(all), coverPaise, clientRef: memberId }),
        insurerQuote(ctx, { product: 'family_floater', members: ages(req.people), coverPaise, clientRef: memberId }),
      ]);
      insured.policy = all.map(({ name, relation, age }) => ({ name, relation, age }));
      insured.policy_alt = req.people.map(({ name, relation, age }) => ({ name, relation, age }));
      options = [
        { key: 'policy', label: 'Add them to your current floater', addedPremiumPaise: Math.max(0, together.terms.annualPremiumPaise - existing.annualPremiumPaise), policies: [together], note: `Replaces your current ${lakhs(existing.coverPaise)} floater (${formatShort(existing.annualPremiumPaise)} a year): one shared ${lakhs(coverPaise)} for all ${all.length}, priced on the eldest.` },
        { key: 'policy_alt', label: 'A separate floater for them', addedPremiumPaise: separate.terms.annualPremiumPaise, policies: [separate], note: `Your current floater stays as it is; they get their own ${lakhs(coverPaise)}.` },
      ];
    } else {
      const half = Math.max(LAKH, Math.round(coverPaise / 2 / LAKH) * LAKH);
      const [full, base, topUp] = await Promise.all([
        insurerQuote(ctx, { product: 'family_floater', members: ages(req.people), coverPaise, clientRef: memberId }),
        insurerQuote(ctx, { product: 'family_floater', members: ages(req.people), coverPaise: half, clientRef: memberId }),
        insurerQuote(ctx, { product: 'super_top_up', members: ages(req.people), coverPaise: coverPaise - half, deductiblePaise: half, clientRef: memberId }),
      ]);
      insured.policy = insured.policy_alt = req.people.map(({ name, relation, age }) => ({ name, relation, age }));
      options = [
        { key: 'policy', label: req.people.length > 1 ? `One ${lakhs(coverPaise)} floater` : `A ${lakhs(coverPaise)} health policy`, addedPremiumPaise: full.terms.annualPremiumPaise, policies: [full], note: `${lakhs(coverPaise)} from the first rupee of a claim.` },
        { key: 'policy_alt', label: `${lakhs(half)} base plus a ${lakhs(coverPaise - half)} top-up`, addedPremiumPaise: base.terms.annualPremiumPaise + topUp.terms.annualPremiumPaise, policies: [base, topUp], note: `The same ${lakhs(coverPaise)} in total: the top-up pays once a year’s claims pass ${lakhs(half)}.` },
      ];
    }
    r = evaluateFloater(s, req, options, { rules });
  }
  if (r.kind !== 'decision') throw new Error('engine asked for quotes twice');
  const d = r.decision;
  if (d.offer) {
    d.offer.context = {
      ...d.offer.context,
      insured,
      terms: Object.fromEntries(options.map((o) => [o.key, o.policies.map((p) => p.terms)])),
      replaces: plan.structure === 'add_vs_separate' ? { policy: existing?.policyRef ?? null } : {},
    };
  }
  const saved = await persistDecision(ctx, memberId, d, null, `floater:${people.map((p) => p.id).sort().join('+')}:${coverPaise}`, s.today);
  const waits = options[0]?.policies[0]?.terms.waitingPeriods ?? [];
  return { ...saved, view: floaterComparisonView(req.people, coverPaise, options, waits, d.netBenefitPaise ?? 0, d.explanation, saved.offerId) };
}

const formatShort = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

// ── Feature 6: Protection gap ────────────────────────────────────────────────

/** Policies CRED can read: an active Account Aggregator consent for insurance. */
export async function insuranceLinked(ctx: Ctx, memberId: string) {
  return ctx.db.aaConsent.findFirst({ where: { memberId, purpose: 'protection_review', status: 'ACTIVE' } });
}

export async function gapAreas(ctx: Ctx, memberId: string) {
  const [policies, family] = await Promise.all([
    ctx.db.insurancePolicy.findMany({ where: { memberId, status: 'active' } }),
    ctx.db.familyMember.findMany({ where: { memberId } }),
  ]);
  const cover: CoverPolicy[] = policies.map((p) => ({
    ref: p.externalRef,
    kind: PolicyKind.parse(p.kind),
    productName: p.productName,
    coverPaise: p.coverPaise,
    deductiblePaise: p.deductiblePaise,
    isEmployer: p.isEmployer,
    employerName: p.employerName,
    membersCovered: Relation.array().parse(JSON.parse(p.membersCoveredJson)),
    vehicle: p.vehicleJson ? JSON.parse(p.vehicleJson) : null,
  }));
  return { areas: assessGap(cover, family.map((f) => Relation.parse(f.relation)), activeRules()), policies };
}

export async function runProtectionGap(
  ctx: Ctx,
  memberId: string,
  input: { focus: GapFocus; trigger: string; origin: TriggerOrigin; triggerRef: string; triggerEventId: string | null },
): Promise<Result & { gap: ProtectionGap }> {
  const consent = await insuranceLinked(ctx, memberId);
  if (consent) {
    // A consented pull: the latest cover, including anything new (a dealer's motor policy)
    await refreshFromAa(ctx, consent.id).catch((e) => ctx.log.warn({ err: String(e) }, 'AA refresh before gap check failed'));
  }
  const s = await buildSnapshot(ctx, memberId);
  const rules = activeRules();
  const { areas, policies } = await gapAreas(ctx, memberId);
  const ev = { linked: !!consent, areas, focus: input.focus, trigger: input.trigger };
  let r = evaluateProtectionGap(s, ev, null, { origin: input.origin, rules });
  if (r.kind === 'needs_quotes' && 'area' in r) {
    const area = r.area;
    let options: CoverOption[];
    if (area.area === 'motor' && area.vehicle) {
      const tp = policies.find((p) => p.vehicleJson?.includes(area.vehicle!.registration) && p.kind === 'motor_third_party');
      const [od, comp] = await Promise.all([
        insurerQuote(ctx, { product: 'motor_own_damage', vehicle: area.vehicle, clientRef: memberId }),
        insurerQuote(ctx, { product: 'motor_comprehensive', vehicle: area.vehicle, clientRef: memberId }),
      ]);
      options = [
        { key: 'policy', label: 'Standalone own-damage cover', addedPremiumPaise: od.terms.annualPremiumPaise, policies: [od], note: 'Adds cover for your own car; your third-party policy stays as it is.' },
        {
          key: 'policy_alt',
          label: 'Switch to a comprehensive policy',
          addedPremiumPaise: Math.max(1, comp.terms.annualPremiumPaise - (tp?.annualPremiumPaise ?? 0)),
          policies: [comp],
          note: 'Replaces your third-party policy with one that covers both; the cost shown is after the refund of your current one.',
        },
      ];
    } else {
      const coveredRelations = Relation.array().parse(JSON.parse(policies.find((p) => !p.vehicleJson && (JSON.parse(p.membersCoveredJson) as string[]).includes('self'))?.membersCoveredJson ?? '["self"]'));
      const people = (await agesFor(ctx, memberId, coveredRelations)).map(({ relation, age }) => ({ relation, age }));
      const gap = Math.ceil(area.gapPaise / LAKH) * LAKH;
      const [topUp, base] = await Promise.all([
        insurerQuote(ctx, { product: 'super_top_up', members: people, coverPaise: gap, deductiblePaise: area.existingPaise, clientRef: memberId }),
        insurerQuote(ctx, { product: 'family_floater', members: people, coverPaise: gap, clientRef: memberId }),
      ]);
      options = [
        { key: 'policy', label: `A ${lakhs(gap)} super top-up`, addedPremiumPaise: topUp.terms.annualPremiumPaise, policies: [topUp], note: `Pays once a year’s claims pass the ${lakhs(area.existingPaise)} you already have.` },
        { key: 'policy_alt', label: `A second ${lakhs(gap)} base policy`, addedPremiumPaise: base.terms.annualPremiumPaise, policies: [base], note: 'Pays from the first rupee, alongside your current cover.' },
      ];
    }
    r = evaluateProtectionGap(s, ev, options, { origin: input.origin, rules });
    if (r.kind === 'decision' && r.decision.offer) {
      const insured = await agesFor(ctx, memberId, area.area === 'health' ? Relation.array().parse(JSON.parse(policies.find((p) => !p.vehicleJson && (JSON.parse(p.membersCoveredJson) as string[]).includes('self'))?.membersCoveredJson ?? '["self"]')) : []);
      r.decision.offer.context = {
        ...r.decision.offer.context,
        insured: { policy: insured, policy_alt: insured },
        terms: Object.fromEntries(options.map((o) => [o.key, o.policies.map((p) => p.terms)])),
        replaces: area.area === 'motor' ? { policy_alt: policies.find((p) => p.kind === 'motor_third_party')?.externalRef ?? null } : {},
      };
    }
  }
  if (r.kind !== 'decision') throw new Error('engine asked for quotes twice');
  const saved = await persistDecision(ctx, memberId, r.decision, input.triggerEventId, input.triggerRef, s.today);
  if (input.focus === 'motor' && r.decision.reasons[0] === 'needs_data' && input.origin === 'proactive') {
    // We can't see the car's cover: ask, as information the member can act on (not a permission prompt)
    await raiseAlert(ctx, memberId, { kind: 'policy', title: 'New car? Check its cover', body: r.decision.explanation, href: '/protect/vehicle', sourceRef: `vehicle-check:${input.triggerRef}` });
  }
  return { ...saved, gap: { linked: !!consent, checkedOn: s.today, areas, explanation: r.decision.explanation, offerId: saved.offerId } };
}

// ── Feature 3: Earned Credit Ladder (shown as available, never pushed) ──────

export async function recordLadderChange(ctx: Ctx, memberId: string, prev: LadderPosition, step: LadderStep, triggerRef: string): Promise<Result | null> {
  if (step.change === 'none') return null;
  const s = await buildSnapshot(ctx, memberId);
  const r = evaluateLadderChange(s, prev, step, activeRules());
  if (r.kind !== 'decision') return null;
  return persistDecision(ctx, memberId, r.decision, null, triggerRef, s.today);
}

// ── Saving decisions ─────────────────────────────────────────────────────────

export async function persistDecision(ctx: Ctx, memberId: string, d: DecisionDraft, triggerEventId: string | null, triggerRef: string, simDate: string): Promise<Result> {
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
        benefitLabel: o.benefitLabel,
        contextJson: JSON.stringify(o.context ?? {}),
        comparisonJson: JSON.stringify(o.comparison),
        optionsJson: JSON.stringify(o.options),
        termsJson: JSON.stringify(o.terms),
        triggerJson: JSON.stringify(o.trigger),
        why: d.explanation,
        triggerRef,
        quoteRefsJson: JSON.stringify(o.quoteRefs),
        simDate,
        shownAt: o.status === 'shown' ? new Date() : null,
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
  return { decisionId: decision.id, offerId, decision: d };
}
