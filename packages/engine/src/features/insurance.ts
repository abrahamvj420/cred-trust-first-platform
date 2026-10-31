import { formatInr, type FloaterComparison, type GapArea, type InsuranceTerms, type OfferOption, type PolicyKind, type Relation, type TriggerOrigin, type Vehicle, type WaitingPeriod } from '@cred/types';
import { capCheck, Decision, permissionCheck, stressCheck, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { MemberSnapshot } from '../snapshot';

/**
 * Protect pillar: Family Health Insurance (feature 4) and the Protection-Gap
 * Engine (feature 6). Prices always come from the insurer's quotes; the engine
 * only compares them, recommends the cheapest way to the same cover, and stays
 * quiet when the member is already covered.
 */
export interface QuotedPolicy {
  quoteRef: string;
  terms: InsuranceTerms;
}

/** A way to arrange cover: one or more policies bought together. */
export interface CoverOption {
  key: 'policy' | 'policy_alt';
  label: string;
  /** Premium this option adds to what the member pays today. */
  addedPremiumPaise: number;
  policies: QuotedPolicy[];
  note: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const LAKH = 1_00_000_00;
const lakhs = (paise: number) => `₹${Number((paise / LAKH).toFixed(1))} lakh`;

function insuranceOptions(noChangeNote: string, options: CoverOption[]): { list: OfferOption[]; best: CoverOption; other: CoverOption } {
  const [best, other] = [...options].sort((a, b) => a.addedPremiumPaise - b.addedPremiumPaise) as [CoverOption, CoverOption];
  const list: OfferOption[] = [
    { key: 'no_change', label: 'Keep things as they are', totalCostPaise: 0, monthlyPaise: null, lines: [], acceptable: false, recommended: false, note: noChangeNote, terms: null },
    ...options.map((o) => ({
      key: o.key,
      label: o.label,
      totalCostPaise: o.addedPremiumPaise,
      monthlyPaise: null,
      lines: o.policies.map((p) => ({ label: `${p.terms.productName} (${lakhs(p.terms.coverPaise)}${p.terms.deductiblePaise ? ` above ${lakhs(p.terms.deductiblePaise)}` : ''}), a year`, amountPaise: p.terms.annualPremiumPaise, kind: 'premium' as const })),
      acceptable: true,
      recommended: o === best,
      note: o.note,
      terms: o.policies[0]!.terms,
    })),
  ];
  return { list, best, other };
}

function affordable(d: Decision, s: MemberSnapshot, premiumPaise: number, rules: RuleValues): EngineResult | null {
  if (s.verifiedMonthlyIncomePaise !== null) {
    const cap = Math.round((s.verifiedMonthlyIncomePaise * 12 * rules.maxPremiumToIncomeBps) / 10_000);
    if (premiumPaise > cap) {
      return d.stop('affordability', 'above_affordability', `Premium ${formatInr(premiumPaise)} above ${formatInr(cap)} (share of yearly income).`, 'This cover would stretch your budget, so we’re not suggesting it. We can look at a smaller cover with you.');
    }
    d.pass('affordability', `Premium ${formatInr(premiumPaise)} within ${formatInr(cap)} a year.`);
  } else {
    d.pass('affordability', `Premium ${formatInr(premiumPaise)} a year; no income shared, so no income cap applied.`);
  }
  return null;
}

// ── Feature 4: family floater comparison ──────────────────────────────────────

export interface FamilyPerson {
  id: string;
  name: string;
  relation: Relation;
  age: number;
}

export interface ExistingFloater {
  policyRef: string;
  productName: string;
  coverPaise: number;
  annualPremiumPaise: number;
  members: Relation[];
}

export type FloaterStructure = 'add_vs_separate' | 'base_vs_topup';

/**
 * Which two ways to compare. With a personal floater already in place: add the
 * new people to it, or give them their own floater. Otherwise: one base policy
 * for the full cover, or a smaller base plus a super top-up.
 */
export function floaterPlan(people: FamilyPerson[], existing: ExistingFloater | null): { structure: FloaterStructure; uncovered: FamilyPerson[] } {
  const uncovered = existing ? people.filter((p) => !existing.members.includes(p.relation)) : people;
  return { structure: existing && uncovered.length > 0 ? 'add_vs_separate' : 'base_vs_topup', uncovered };
}

export function evaluateFloater(
  s: MemberSnapshot,
  req: { people: FamilyPerson[]; coverPaise: number; existing: ExistingFloater | null; structure: FloaterStructure },
  options: CoverOption[] | null,
  opts: { rules?: RuleValues } = {},
): EngineResult | { kind: 'needs_quotes' } {
  const rules = opts.rules ?? DEFAULT_RULES;
  const d = new Decision('family_health_insurance', 'member_initiated');
  if (!req.people.length) return d.stop('signal', 'not_eligible', 'No family members chosen.', 'Choose who you’d like to cover.');
  d.pass('signal', `Member asked to cover ${req.people.map((p) => p.relation).join(', ')} for ${lakhs(req.coverPaise)}.`);
  const stop = permissionCheck(d, s, rules) ?? stressCheck(d, s, rules) ?? capCheck(d, s, rules);
  if (stop) return stop;
  if (!options) return { kind: 'needs_quotes' };
  if (options.length < 2) return d.stop('net_benefit', 'not_eligible', 'Insurer gave fewer than two quotes.', 'The insurer couldn’t price this just now. Please try again a little later.');

  const noChange = req.structure === 'add_vs_separate' ? `₹0 more. ${req.people.map((p) => p.name.split(' ')[0]).join(' and ')} stay uncovered.` : '₹0. Nobody new is covered.';
  const { list, best, other } = insuranceOptions(noChange, options);
  const stopAfford = affordable(d, s, best.addedPremiumPaise, rules);
  if (stopAfford) return stopAfford;

  const net = other.addedPremiumPaise - best.addedPremiumPaise;
  if (net <= 0) {
    return d.stop('net_benefit', 'no_net_benefit', 'Both ways cost the same.', 'Both ways of arranging this cover cost the same, so there’s no saving to point to. Both are shown for you to choose.');
  }
  d.pass('net_benefit', `${best.label} costs ${formatInr(net)} a year less than ${other.label.toLowerCase()}.`);
  const names = req.people.map((p) => p.name.split(' ')[0]).join(' and ');
  const why = `You asked to cover ${names}. We compared the insurer’s prices for two ways to do it: ${best.label.toLowerCase()} costs ${formatInr(best.addedPremiumPaise)} a year, ${formatInr(net)} less than ${other.label.toLowerCase()}. Waiting periods are listed with each quote.`;
  return d.offer(
    net,
    {
      headline: `Cover ${names} for ${formatInr(best.addedPremiumPaise)} a year: ${best.label.toLowerCase()} costs ${formatInr(net)} a year less`,
      subline: `${lakhs(req.coverPaise)} of cover from ${best.policies[0]!.terms.insurerName}. Waiting periods apply; see them before you decide.`,
      benefitLabel: 'a year less than the other way',
      comparison: {
        current: { label: other.label, totalCostPaise: other.addedPremiumPaise, lines: list.find((o) => o.key === other.key)!.lines },
        proposed: { label: best.label, totalCostPaise: best.addedPremiumPaise, lines: list.find((o) => o.key === best.key)!.lines },
        netBenefitPaise: net,
      },
      options: list,
      terms: best.policies[0]!.terms,
      trigger: null,
      quoteRefs: Object.fromEntries(options.map((o) => [o.key, o.policies[0]!.quoteRef])),
      context: { policies: Object.fromEntries(options.map((o) => [o.key, o.policies.map((p) => p.quoteRef)])), insured: req.people, replaces: req.structure === 'add_vs_separate' ? { policy: req.existing?.policyRef ?? null } : {} },
    },
    why,
  );
}

/** The comparison as the member sees it (also when no offer could be made). */
export function floaterComparisonView(people: FamilyPerson[], coverPaise: number, options: CoverOption[], waitingPeriods: WaitingPeriod[], net: number, explanation: string, offerId: string | null): FloaterComparison {
  const best = [...options].sort((a, b) => a.addedPremiumPaise - b.addedPremiumPaise)[0];
  return {
    members: people.map(({ name, relation, age }) => ({ name, relation, age })),
    coverPaise,
    options: options.map((o) => ({ key: o.key, label: o.label, totalPremiumPaise: Math.max(1, o.addedPremiumPaise), policies: o.policies.map((p) => p.terms), recommended: o === best && net > 0, note: o.note })),
    waitingPeriods,
    netBenefitPaise: net,
    explanation,
    offerId,
  };
}

// ── Feature 6: protection gap ─────────────────────────────────────────────────

export interface CoverPolicy {
  ref: string;
  kind: PolicyKind;
  productName: string;
  coverPaise: number;
  deductiblePaise: number;
  isEmployer: boolean;
  employerName: string | null;
  membersCovered: Relation[];
  vehicle: Vehicle | null;
}

const HEALTH: PolicyKind[] = ['health_individual', 'health_family_floater', 'employer_group_health', 'health_super_top_up'];

/** Cover needed vs held, by area. Employer cover counts, flagged as ending if the member changes jobs. */
export function assessGap(policies: CoverPolicy[], family: Relation[], rules: RuleValues = DEFAULT_RULES): GapArea[] {
  const areas: GapArea[] = [];
  const mine = policies.filter((p) => HEALTH.includes(p.kind) && p.membersCovered.includes('self'));
  const base = mine.filter((p) => p.kind !== 'health_super_top_up');
  const baseCover = sum(base.map((p) => p.coverPaise));
  const topUp = sum(mine.filter((p) => p.kind === 'health_super_top_up' && p.deductiblePaise <= baseCover).map((p) => p.coverPaise));
  const existing = baseCover + topUp;
  const employer = sum(base.filter((p) => p.isEmployer).map((p) => p.coverPaise));
  const need = rules.healthCoverNeedPaise;
  const who = family.some((r) => r === 'spouse' || r === 'child') ? 'you, your spouse and children' : 'you';
  const employerName = base.find((p) => p.isEmployer)?.employerName;
  areas.push({
    area: 'health',
    title: 'Health cover',
    needPaise: need,
    existingPaise: existing,
    employerPaise: employer,
    gapPaise: Math.max(0, need - existing),
    covered: existing >= need,
    rationale: [
      `We suggest ${lakhs(need)} of health cover for ${who}: one serious illness or surgery in a city hospital can cost several lakh rupees.`,
      existing ? `You hold ${lakhs(existing)}${employer ? `, of which ${lakhs(employer)} is from ${employerName ?? 'your employer'} and ends if you change jobs` : ''}.` : 'We don’t see any health cover in your name.',
      ...(existing >= need ? ['That meets what we suggest, so there’s nothing to add.'] : []),
    ],
    vehicle: null,
  });

  const byVehicle = new Map<string, CoverPolicy[]>();
  for (const p of policies.filter((x) => x.vehicle)) byVehicle.set(p.vehicle!.registration, [...(byVehicle.get(p.vehicle!.registration) ?? []), p]);
  for (const ps of byVehicle.values()) {
    const v = ps[0]!.vehicle!;
    const damage = ps.some((p) => p.kind === 'motor_comprehensive' || p.kind === 'motor_own_damage');
    areas.push({
      area: 'motor',
      title: `${v.makeModel} (${v.registration})`,
      needPaise: v.idvPaise,
      existingPaise: damage ? v.idvPaise : 0,
      employerPaise: 0,
      gapPaise: damage ? 0 : v.idvPaise,
      covered: damage,
      rationale: damage
        ? ['Your car has third-party and own-damage cover, so there’s nothing to add.']
        : [
            'Your car has the third-party cover the law requires, which pays for damage to others, not to your car.',
            `Repairs after an accident, or theft, aren’t covered: your car is insured for ${formatInr(v.idvPaise)} (its declared value).`,
          ],
      vehicle: v,
    });
  }
  return areas;
}

export type GapFocus = 'health' | 'motor';

/**
 * Checks: signal (data linked, a gap exists) → permission → stress → offer cap
 * → affordability → net benefit. Nothing is suggested when the member is covered.
 */
export function evaluateProtectionGap(
  s: MemberSnapshot,
  input: { linked: boolean; areas: GapArea[]; focus: GapFocus; trigger: string },
  options: CoverOption[] | null,
  opts: { origin?: TriggerOrigin; rules?: RuleValues } = {},
): EngineResult | { kind: 'needs_quotes'; area: GapArea } {
  const rules = opts.rules ?? DEFAULT_RULES;
  const d = new Decision('protection_gap', opts.origin ?? 'proactive');
  if (!input.linked) {
    return d.stop(
      'signal',
      'needs_data',
      `${input.trigger}: no policy data linked; can’t read existing cover.`,
      'We couldn’t check your cover because your policies aren’t linked. You can link them through Account Aggregator in Protect.',
    );
  }
  const area = input.areas.find((a) => a.area === input.focus) ?? input.areas.find((a) => !a.covered);
  if (!area || area.covered) {
    const what = area?.area === 'motor' ? 'your car is fully covered' : `you hold ${lakhs(area?.existingPaise ?? 0)} of health cover against the ${lakhs(rules.healthCoverNeedPaise)} we suggest`;
    return d.stop('signal', 'already_covered', `${input.trigger}: covered (${area?.title ?? 'all areas'}).`, `We checked your cover after ${input.trigger.toLowerCase()}: ${what}, so there’s nothing to add.`);
  }
  d.pass('signal', `${input.trigger}: ${area.title} gap of ${formatInr(area.gapPaise)}.`);
  const stop = permissionCheck(d, s, rules) ?? stressCheck(d, s, rules) ?? capCheck(d, s, rules);
  if (stop) return stop;
  if (!options) return { kind: 'needs_quotes', area };
  if (options.length < 2) return d.stop('net_benefit', 'not_eligible', 'Insurer gave fewer than two quotes.', 'The insurer couldn’t price this just now. Please try again a little later.');

  const { list, best, other } = insuranceOptions(area.area === 'motor' ? '₹0. Damage to your own car stays uncovered.' : `₹0. Your cover stays at ${lakhs(area.existingPaise)}.`, options);
  const stopAfford = affordable(d, s, best.addedPremiumPaise, rules);
  if (stopAfford) return stopAfford;
  const net = other.addedPremiumPaise - best.addedPremiumPaise;
  if (net <= 0) return d.stop('net_benefit', 'no_net_benefit', 'Both ways cost the same.', 'Both ways of closing the gap cost the same, so there’s no saving to point to.');
  d.pass('net_benefit', `${best.label} costs ${formatInr(net)} a year less than ${other.label.toLowerCase()}.`);

  const gap = area.area === 'motor' ? 'cover for damage to your car' : `${lakhs(area.gapPaise)} health cover gap`;
  const why =
    `We checked your cover after ${input.trigger.toLowerCase()}. ${area.rationale.join(' ')} The cheapest way to close it is ${best.label.toLowerCase()}, ${formatInr(net)} a year less than ${other.label.toLowerCase()}.` +
    (d.origin === 'proactive' ? (d.awaitingPermission ? ' We’ll only show it if you turn on Smart Savings.' : ' You see it because Smart Savings is on.') : '');
  return d.offer(
    net,
    {
      headline: `Close your ${gap} for ${formatInr(best.addedPremiumPaise)} a year: ${best.label.toLowerCase()} costs ${formatInr(net)} a year less than ${other.label.toLowerCase()}`,
      subline: `From ${best.policies[0]!.terms.insurerName}. ${area.area === 'health' ? 'Waiting periods apply; see them before you decide.' : 'Your current third-party cover stays as it is.'}`,
      benefitLabel: 'a year less than the other way',
      comparison: {
        current: { label: other.label, totalCostPaise: other.addedPremiumPaise, lines: list.find((o) => o.key === other.key)!.lines },
        proposed: { label: best.label, totalCostPaise: best.addedPremiumPaise, lines: list.find((o) => o.key === best.key)!.lines },
        netBenefitPaise: net,
      },
      options: list,
      terms: best.policies[0]!.terms,
      trigger: null,
      quoteRefs: Object.fromEntries(options.map((o) => [o.key, o.policies[0]!.quoteRef])),
      context: { policies: Object.fromEntries(options.map((o) => [o.key, o.policies.map((p) => p.quoteRef)])), area: area.area, insured: [] },
    },
    why,
  );
}

// ── Feature 4: wellness rewards ───────────────────────────────────────────────

/** Premium reward from the average weekly activity score (summaries only). */
export function wellnessReward(premiumPaise: number, weeklyScores: number[], maxPct: number, rules: RuleValues = DEFAULT_RULES) {
  const recent = weeklyScores.slice(0, 4);
  const averageScore = recent.length ? Math.round(sum(recent) / recent.length) : null;
  const share = averageScore === null ? 0 : averageScore >= rules.wellnessFullScore ? 1 : averageScore >= rules.wellnessHalfScore ? 0.5 : averageScore >= rules.wellnessQuarterScore ? 0.25 : 0;
  const rewardPct = Number((maxPct * share).toFixed(2));
  return {
    averageScore,
    rewardPct,
    rewardPaise: Math.round((premiumPaise * rewardPct) / 100),
    maxPaise: Math.round((premiumPaise * maxPct) / 100),
  };
}
