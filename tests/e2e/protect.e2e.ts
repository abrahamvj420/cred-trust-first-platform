/**
 * M5 "Protect": Family Health Insurance + Wellness Rewards (4) and the
 * Protection-Gap Engine + Claims Concierge (6), each from its real trigger.
 */
import { credApi, ecosystemApi } from '@cred/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { cred, decideConsent, eco, eventually, login, resetWorld, scenario, settle } from './helpers';

beforeEach(resetWorld);

const me = async (token: string) => (await cred(credApi.member.home, { token })).member.id;
const decisions = async (memberId: string, feature: string) => (await cred(credApi.admin.decisions, { query: { memberId } })).decisions.filter((d) => d.feature === feature);

describe('Family Health Insurance (4): trigger is the member adding family', () => {
  it('adding parents → the insurer’s floater comparison, waiting periods stated → policy issued by webhook', async () => {
    const token = await login('priya');
    const gopal = (await cred(credApi.products.addFamilyMember, { token, body: { name: 'Gopal Menon', relation: 'parent', age: 68 } })).member;
    const lakshmi = (await cred(credApi.products.addFamilyMember, { token, body: { name: 'Lakshmi Menon', relation: 'parent', age: 64 } })).member;

    const q = await cred(credApi.products.healthQuote, { token, body: { coverPaise: 5_00_000_00, familyMemberIds: [gopal.id, lakshmi.id] } });
    // Adding seniors to the family floater re-prices it for everyone; a separate floater costs less
    const together = q.options.find((o) => o.key === 'policy')!;
    const separate = q.options.find((o) => o.key === 'policy_alt')!;
    expect(together.totalPremiumPaise).toBe(1_07_800_00 - 24_800_00);
    expect(separate.totalPremiumPaise).toBe(63_700_00);
    expect(separate.recommended).toBe(true);
    expect(q.netBenefitPaise).toBe(19_300_00);
    expect(q.waitingPeriods.map((w) => w.label)).toEqual(['Initial waiting', 'Named illnesses (e.g. cataract, hernia)', 'Pre-existing conditions']);
    expect(q.offerId).not.toBeNull();

    const offer = (await cred(credApi.products.offer, { token, params: { offerId: q.offerId! } })).offer;
    expect(offer).toMatchObject({ feature: 'family_health_insurance', origin: 'member_initiated', status: 'shown' });
    expect(offer.options[0]).toMatchObject({ key: 'no_change', totalCostPaise: 0 });
    const kfs = await cred(credApi.products.keyFacts, { token, params: { offerId: offer.id }, query: { option: 'policy_alt' } });
    expect(kfs.kind).toBe('insurance');
    expect(kfs.items.find((i) => i.label === 'Waiting period: Pre-existing conditions')!.value).toBe('3 years');
    expect(kfs.items.find((i) => i.label === 'GST')!.value).toMatch(/GST-exempt/);

    const acc = await cred(credApi.products.acceptOffer, { token, params: { offerId: offer.id }, body: { option: 'policy_alt', keyFactsAcknowledged: true } });
    expect(acc.otp.purpose).toMatch(/proposal/);
    await cred(credApi.products.confirmOffer, { token, params: { offerId: offer.id }, body: { otp: acc.otp.demoOtp } });
    await settle();
    const policies = (await cred(credApi.products.policies, { token })).policies;
    const parents = policies.find((p) => p.membersCovered.join() === 'parent,parent')!;
    expect(parents).toMatchObject({ source: 'cred_purchase', coverPaise: 5_00_000_00, annualPremiumPaise: 63_700_00 });
    // The family floater stays as it was
    expect(policies.find((p) => p.membersCovered.includes('self') && !p.isEmployer)!.annualPremiumPaise).toBe(24_800_00);
  });

  it('wellness: only a weekly summary is shared, it earns a premium reward, and turning it off deletes it', async () => {
    const priya = await login('priya');
    const w = await cred(credApi.products.wellness, { token: priya });
    expect(w).toMatchObject({ linked: true, provider: 'health_connect', policyName: 'Sahaj Family Floater' });
    expect(w.weeks.length).toBe(4);
    expect(Object.keys(w.weeks[0]!).sort()).toEqual(['activeDays', 'avgDailySteps', 'score', 'weekStart']);
    expect(w.rewardMaxPaise).toBe(2_480_00);
    expect(w.rewardEarnedPaise).toBe(Math.round((24_800_00 * w.rewardPct) / 100));

    // Asked only when the member picks it: no permission, no link
    const aarav = await login('aarav');
    await expect(cred(credApi.products.linkWearable, { token: aarav, body: { provider: 'apple_health' } })).rejects.toMatchObject({ status: 403 });
    await cred(credApi.member.grantPermission, { token: aarav, body: { scope: 'health_data', context: 'Wellness rewards', explicit: true } });
    await cred(credApi.products.linkWearable, { token: aarav, body: { provider: 'apple_health' } });
    await settle();
    const linked = await cred(credApi.products.wellness, { token: aarav });
    expect(linked).toMatchObject({ linked: true, provider: 'apple_health' });
    expect(linked.weeks.length).toBe(4);
    await cred(credApi.member.withdrawPermission, { token: aarav, params: { scope: 'health_data' } });
    expect(await cred(credApi.products.wellness, { token: aarav })).toMatchObject({ linked: false, weeks: [] });
  });

  it('blocked: a member clearing a balance gets help, not a cover sale', async () => {
    const token = await login('rohan');
    const mum = (await cred(credApi.products.addFamilyMember, { token, body: { name: 'Anita Das', relation: 'parent', age: 55 } })).member;
    const q = await cred(credApi.products.healthQuote, { token, body: { coverPaise: 5_00_000_00, familyMemberIds: [mum.id] } });
    expect(q.offerId).toBeNull();
    const [d] = await decisions(await me(token), 'family_health_insurance');
    expect(d).toMatchObject({ outcome: 'help' });
  });
});

describe('Protection-Gap Engine (6): triggers are an insurer renewal or a new vehicle', () => {
  it('renewal → reads employer cover → recommends the cheapest way to close the gap (a super top-up)', async () => {
    const token = await login('priya');
    await scenario('insurer_renewal', 'priya');
    const offer = await eventually(async () => (await cred(credApi.products.offers, { token })).active, 'gap offer');
    expect(offer).toMatchObject({ feature: 'protection_gap', origin: 'proactive', status: 'shown' });
    const best = offer.options.find((o) => o.recommended)!;
    expect(best.key).toBe('policy');
    expect(best.label).toBe('A ₹2 lakh super top-up');
    expect(offer.why).toMatch(/Coastline Logistics Ltd and ends if you change jobs/);
    const gap = await cred(credApi.products.protectionGap, { token });
    expect(gap.areas.find((a) => a.area === 'health')).toMatchObject({ needPaise: 10_00_000_00, existingPaise: 8_00_000_00, employerPaise: 3_00_000_00, gapPaise: 2_00_000_00 });
    expect(gap.offerId).toBe(offer.id);
    // The renewal itself is a reminder with the wellness reward
    const alert = (await cred(credApi.products.alerts, { token })).alerts.find((a) => a.kind === 'renewal')!;
    expect(alert.body).toMatch(/Renewal premium ₹24,800/);
  });

  it('new vehicle → the dealer sold only third-party cover → own-damage cover recommended', async () => {
    const token = await login('priya');
    await scenario('new_vehicle', 'priya');
    const offer = await eventually(async () => {
      const a = (await cred(credApi.products.offers, { token })).active;
      return a?.feature === 'protection_gap' ? a : null;
    }, 'motor gap offer');
    expect(offer.options.find((o) => o.recommended)!.label).toBe('Standalone own-damage cover');
    expect(offer.headline).toMatch(/^Close your cover for damage to your car/);
    const policies = (await cred(credApi.products.policies, { token })).policies;
    expect(policies.find((p) => p.kind === 'motor_third_party')!.vehicle).toMatchObject({ registration: 'MH 02 VX 4471' });
  });

  it('nothing if covered; and nothing can be checked until policies are linked', async () => {
    const token = await login('sneha');
    const none = await cred(credApi.products.checkProtectionGap, { token });
    expect(none).toMatchObject({ linked: false, offerId: null });
    expect(none.explanation).toMatch(/aren’t linked/);

    const start = await cred(credApi.member.startAaConsent, { token, body: { purpose: 'protection_review', returnTo: '/protect' } });
    await decideConsent(start.redirectUrl);
    const covered = await cred(credApi.products.checkProtectionGap, { token });
    expect(covered.linked).toBe(true);
    expect(covered.areas.find((a) => a.area === 'health')).toMatchObject({ covered: true, existingPaise: 10_00_000_00, employerPaise: 10_00_000_00 });
    expect(covered.offerId).toBeNull();
    const [d] = await decisions(await me(token), 'protection_gap');
    expect(d).toMatchObject({ outcome: 'blocked', reasons: ['already_covered'] });
  });
});

describe('Claims Concierge (6)', () => {
  it('file a claim; the insurer’s status updates arrive by webhook and the member is told each step', async () => {
    const token = await login('priya');
    const floater = (await cred(credApi.products.policies, { token })).policies.find((p) => !p.isEmployer && p.membersCovered.includes('self'))!;
    const filed = (await cred(credApi.products.fileClaim, { token, body: { policyId: floater.id, amountPaise: 45_000_00, description: 'Diya: two nights at Seaview Hospital, fever' } })).claim;
    expect(filed).toMatchObject({ status: 'filed', insurerName: 'Sahaj Health Insurance', policyName: 'Sahaj Family Floater' });
    expect(filed.timeline).toHaveLength(1);

    await scenario('claim_update', 'priya');
    const reviewed = (await cred(credApi.products.claim, { token, params: { claimId: filed.id } })).claim;
    expect(reviewed.status).toBe('under_review');
    expect(reviewed.timeline.map((t) => t.status)).toEqual(['filed', 'under_review']);
    await scenario('claim_update', 'priya');
    await scenario('claim_update', 'priya');
    const settled = (await cred(credApi.products.claim, { token, params: { claimId: filed.id } })).claim;
    expect(settled.status).toBe('settled');
    expect(settled.nextStep).toMatch(/Paid/);
    expect((await cred(credApi.products.alerts, { token })).alerts.filter((a) => a.kind === 'claim')).toHaveLength(3);
    await expect(eco(ecosystemApi.sim.scenario, { body: { scenario: 'claim_update', personaKey: 'priya' } })).rejects.toMatchObject({ status: 422 });
  });

  it('blocked: a claim above the cover is refused', async () => {
    const token = await login('priya');
    const floater = (await cred(credApi.products.policies, { token })).policies.find((p) => !p.isEmployer && p.membersCovered.includes('self'))!;
    await expect(cred(credApi.products.fileClaim, { token, body: { policyId: floater.id, amountPaise: 6_00_000_00, description: 'Too much' } })).rejects.toMatchObject({ status: 422, code: 'above_cover' });
    expect((await cred(credApi.products.claims, { token })).claims).toEqual([]);
  });
});
