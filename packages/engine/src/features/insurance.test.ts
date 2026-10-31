import type { InsuranceTerms } from '@cred/types';
import { describe, expect, it } from 'vitest';
import { BANNED_MEMBER_WORDS, memberFacingStrings } from '../member-copy';
import { fullPayer, stressed } from '../test/fixtures';
import { assessGap, evaluateFloater, evaluateProtectionGap, floaterPlan, wellnessReward, type CoverOption, type CoverPolicy } from './insurance';

const terms = (over: Partial<InsuranceTerms>): InsuranceTerms => ({
  kind: 'insurance',
  productKind: 'family_floater',
  insurerName: 'Sahaj Health Insurance',
  productName: 'Sahaj Family Floater',
  coverPaise: 5_00_000_00,
  deductiblePaise: 0,
  annualPremiumPaise: 63_700_00,
  gstPaise: 0,
  members: [],
  waitingPeriods: [{ label: 'Pre-existing conditions', detail: '3 years', days: 1095 }],
  vehicle: null,
  wellnessRewardMaxPct: 10,
  freeLookDays: 30,
  ...over,
});
const opt = (key: 'policy' | 'policy_alt', label: string, added: number, policies: InsuranceTerms[]): CoverOption => ({
  key,
  label,
  addedPremiumPaise: added,
  policies: policies.map((t, i) => ({ quoteRef: `${key}_${i}`, terms: t })),
  note: '',
});

const parents = [
  { id: 'f1', name: 'Gopal Menon', relation: 'parent' as const, age: 68 },
  { id: 'f2', name: 'Lakshmi Menon', relation: 'parent' as const, age: 64 },
];
const existing = { policyRef: 'pol_priya_1', productName: 'Sahaj Family Floater', coverPaise: 5_00_000_00, annualPremiumPaise: 24_800_00, members: ['self' as const, 'spouse' as const, 'child' as const] };

describe('family floater comparison (feature 4)', () => {
  it('with a family floater in place, compares adding parents to it with their own floater', () => {
    expect(floaterPlan(parents, existing)).toMatchObject({ structure: 'add_vs_separate', uncovered: parents });
    expect(floaterPlan(parents, null).structure).toBe('base_vs_topup');
  });

  it('recommends the cheaper way, saving shown in rupees, "keep as is" first; member-initiated needs no Smart Savings', () => {
    const options = [opt('policy', 'Add them to your current floater', 83_000_00, [terms({ annualPremiumPaise: 1_07_800_00 })]), opt('policy_alt', 'A separate floater for them', 63_700_00, [terms({})])];
    const r = evaluateFloater(fullPayer({ smartSavings: 'never' }), { people: parents, coverPaise: 5_00_000_00, existing, structure: 'add_vs_separate' }, options);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.outcome).toBe('offer');
    expect(r.decision.netBenefitPaise).toBe(19_300_00);
    const o = r.decision.offer!;
    expect(o.status).toBe('shown');
    expect(o.options.map((x) => x.key)).toEqual(['no_change', 'policy', 'policy_alt']);
    expect(o.options.find((x) => x.recommended)!.key).toBe('policy_alt');
    expect(o.options[0]!.totalCostPaise).toBe(0);
    for (const t of memberFacingStrings(r.decision)) expect(t).not.toMatch(BANNED_MEMBER_WORDS);
  });

  it('no saving between the two ways → no offer', () => {
    const options = [opt('policy', 'A', 50_000_00, [terms({})]), opt('policy_alt', 'B', 50_000_00, [terms({})])];
    const r = evaluateFloater(fullPayer(), { people: parents, coverPaise: 5_00_000_00, existing, structure: 'add_vs_separate' }, options);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.reasons).toEqual(['no_net_benefit']);
  });

  it('premiums above the share of verified income are not suggested', () => {
    const options = [opt('policy', 'A', 90_000_00, [terms({})]), opt('policy_alt', 'B', 70_000_00, [terms({})])];
    const r = evaluateFloater(fullPayer({ verifiedMonthlyIncomePaise: 40_000_00 }), { people: parents, coverPaise: 5_00_000_00, existing, structure: 'add_vs_separate' }, options);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.reasons).toEqual(['above_affordability']);
  });
});

const employer: CoverPolicy = { ref: 'p1', kind: 'employer_group_health', productName: 'Group Health', coverPaise: 3_00_000_00, deductiblePaise: 0, isEmployer: true, employerName: 'Coastline Logistics Ltd', membersCovered: ['self', 'spouse', 'child'], vehicle: null };
const floater: CoverPolicy = { ...employer, ref: 'p2', kind: 'health_family_floater', productName: 'Sahaj Family Floater', coverPaise: 5_00_000_00, isEmployer: false, employerName: null };
const car = { registration: 'MH 02 AB 1234', makeModel: 'Velocity Aura', year: 2026, idvPaise: 9_20_000_00 };
const tp: CoverPolicy = { ref: 'p3', kind: 'motor_third_party', productName: 'Third-party', coverPaise: 7_50_000_00, deductiblePaise: 0, isEmployer: false, employerName: null, membersCovered: [], vehicle: car };

describe('protection gap (feature 6)', () => {
  it('counts employer cover, flags that it ends with the job, and finds the gap', () => {
    const [health] = assessGap([employer, floater], ['spouse', 'child']);
    expect(health).toMatchObject({ area: 'health', needPaise: 10_00_000_00, existingPaise: 8_00_000_00, employerPaise: 3_00_000_00, gapPaise: 2_00_000_00, covered: false });
    expect(health!.rationale.join(' ')).toMatch(/Coastline Logistics Ltd and ends if you change jobs/);
  });

  it('a top-up above the base counts; covered → nothing suggested', () => {
    const topUp: CoverPolicy = { ...floater, ref: 'p4', kind: 'health_super_top_up', coverPaise: 5_00_000_00, deductiblePaise: 5_00_000_00 };
    const [health] = assessGap([employer, floater, topUp], ['spouse']);
    expect(health!.covered).toBe(true);
    const r = evaluateProtectionGap(fullPayer(), { linked: true, areas: [health!], focus: 'health', trigger: 'Your policy renewal' }, null);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.reasons).toEqual(['already_covered']);
    expect(r.decision.offer).toBeNull();
    expect(r.decision.explanation).toMatch(/nothing to add/);
  });

  it('a car with only third-party cover has a gap; comprehensive or own-damage closes it', () => {
    const areas = assessGap([employer, tp], []);
    expect(areas.find((a) => a.area === 'motor')).toMatchObject({ covered: false, gapPaise: 9_20_000_00 });
    const covered = assessGap([employer, tp, { ...tp, ref: 'p5', kind: 'motor_own_damage' }], []);
    expect(covered.find((a) => a.area === 'motor')!.covered).toBe(true);
  });

  it('policies not linked → we can’t check, and say so', () => {
    const r = evaluateProtectionGap(fullPayer(), { linked: false, areas: [], focus: 'health', trigger: 'Your new car' }, null);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.reasons).toEqual(['needs_data']);
  });

  it('recommends the cheapest way to close the gap (proactive: Smart Savings applies)', () => {
    const areas = assessGap([employer, floater], ['spouse', 'child']);
    const input = { linked: true, areas, focus: 'health' as const, trigger: 'Your policy renewal' };
    expect(evaluateProtectionGap(fullPayer(), input, null)).toMatchObject({ kind: 'needs_quotes' });
    const options = [opt('policy', 'A super top-up', 5_200_00, [terms({ productKind: 'super_top_up', deductiblePaise: 8_00_000_00 })]), opt('policy_alt', 'A second base policy', 12_400_00, [terms({})])];
    const r = evaluateProtectionGap(fullPayer(), input, options);
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision.outcome).toBe('offer');
    expect(r.decision.netBenefitPaise).toBe(7_200_00);
    expect(r.decision.offer!.options.find((o) => o.recommended)!.key).toBe('policy');
    const off = evaluateProtectionGap(fullPayer({ smartSavings: 'withdrawn' }), input, options);
    if (off.kind !== 'decision') throw new Error();
    expect(off.decision.reasons).toEqual(['no_permission']);
    const help = evaluateProtectionGap(stressed(), input, options);
    if (help.kind !== 'decision') throw new Error();
    expect(help.decision.outcome).toBe('help');
  });
});

describe('wellness reward', () => {
  it('earns a share of the maximum by average weekly score', () => {
    expect(wellnessReward(24_800_00, [85, 82, 90, 80], 10)).toMatchObject({ averageScore: 84, rewardPct: 10, rewardPaise: 2_480_00, maxPaise: 2_480_00 });
    expect(wellnessReward(24_800_00, [65, 60, 62, 61], 10)).toMatchObject({ rewardPct: 5, rewardPaise: 1_240_00 });
    expect(wellnessReward(24_800_00, [20, 30], 10)).toMatchObject({ rewardPct: 0, rewardPaise: 0 });
    expect(wellnessReward(24_800_00, [], 10)).toMatchObject({ averageScore: null, rewardPaise: 0 });
  });
});
