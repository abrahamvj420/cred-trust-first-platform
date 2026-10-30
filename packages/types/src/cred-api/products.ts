import { z } from 'zod';
import { Id, IsoDate, Ok, PositivePaise } from '../common';
import { endpoint } from '../contract';
import {
  Claim,
  FamilyMember,
  Goal,
  HealthQuote,
  HelpPlan,
  Holding,
  InsurancePolicy,
  KeyFactStatement,
  Loan,
  Offer,
  ProtectionGap,
  SellVsBorrow,
  WellnessStatus,
} from '../domain';
import { Relation, WearableProvider } from '../enums';

const OfferParams = z.object({ offerId: Id });

export const OfferAcceptRequest = z.object({
  /** Member has seen the key-fact screen. Must be set by an explicit tap. */
  keyFactsAcknowledged: z.literal(true),
});

export const GoalInput = z.object({
  name: z.string().min(1).max(60),
  targetPaise: PositivePaise,
  targetDate: IsoDate,
});

export const FamilyMemberInput = z.object({
  name: z.string().min(1).max(60),
  relation: Relation,
  age: z.number().int().min(0).max(110),
});

export const ClaimInput = z.object({
  policyId: Id,
  amountPaise: PositivePaise,
  description: z.string().min(3).max(280),
});

export const productEndpoints = {
  // ── Offers & loans ──
  offers: endpoint({
    method: 'GET',
    path: '/v1/offers',
    auth: 'member',
    summary: 'Active offer (at most one) and history',
    response: z.object({ active: Offer.nullable(), history: z.array(Offer), help: z.array(HelpPlan) }),
  }),
  offer: endpoint({
    method: 'GET',
    path: '/v1/offers/:offerId',
    auth: 'member',
    summary: 'Offer detail with rupee comparison',
    params: OfferParams,
    response: z.object({ offer: Offer }),
  }),
  keyFacts: endpoint({
    method: 'GET',
    path: '/v1/offers/:offerId/key-facts',
    auth: 'member',
    summary: 'Key Fact Statement shown before acceptance',
    params: OfferParams,
    response: KeyFactStatement,
  }),
  acceptOffer: endpoint({
    method: 'POST',
    path: '/v1/offers/:offerId/accept',
    auth: 'member',
    summary: 'Accept after seeing key facts; the partner then decides',
    params: OfferParams,
    body: OfferAcceptRequest,
    response: z.object({ offer: Offer, loan: Loan.nullable(), policy: InsurancePolicy.nullable() }),
  }),
  declineOffer: endpoint({
    method: 'POST',
    path: '/v1/offers/:offerId/decline',
    auth: 'member',
    summary: '"No thanks"',
    params: OfferParams,
    body: z.object({ reason: z.string().max(120).optional() }),
    response: z.object({ offer: Offer }),
  }),
  loans: endpoint({
    method: 'GET',
    path: '/v1/loans',
    auth: 'member',
    summary: 'Loans and EMI schedules',
    response: z.object({ loans: z.array(Loan) }),
  }),
  loan: endpoint({
    method: 'GET',
    path: '/v1/loans/:loanId',
    auth: 'member',
    summary: 'Loan with full EMI schedule',
    params: z.object({ loanId: Id }),
    response: z.object({ loan: Loan }),
  }),

  // ── Wealth (features 2, 7) ──
  holdings: endpoint({
    method: 'GET',
    path: '/v1/wealth/holdings',
    auth: 'member',
    summary: 'Holdings linked via Account Aggregator',
    response: z.object({ linked: z.boolean(), holdings: z.array(Holding), totalValuePaise: z.number().int() }),
  }),
  sellIntent: endpoint({
    method: 'POST',
    path: '/v1/wealth/sell-intents',
    auth: 'member',
    summary: 'Member starts selling: returns sell vs borrow (member-initiated)',
    body: z.object({ holdingId: Id, amountNeededPaise: PositivePaise, months: z.number().int().min(1).max(36) }),
    response: SellVsBorrow,
  }),
  confirmSell: endpoint({
    method: 'POST',
    path: '/v1/wealth/sell-intents/:intentId/sell',
    auth: 'member',
    summary: 'Go ahead and sell (always allowed)',
    params: z.object({ intentId: Id }),
    response: z.object({ redemptionId: Id, status: z.enum(['requested', 'completed']) }),
  }),
  goals: endpoint({
    method: 'GET',
    path: '/v1/wealth/goals',
    auth: 'member',
    summary: 'Goal-based plans with fees disclosed',
    response: z.object({ goals: z.array(Goal) }),
  }),
  createGoal: endpoint({
    method: 'POST',
    path: '/v1/wealth/goals',
    auth: 'member',
    summary: 'Create a goal',
    body: GoalInput,
    response: z.object({ goal: Goal }),
  }),
  updateGoal: endpoint({
    method: 'PATCH',
    path: '/v1/wealth/goals/:goalId',
    auth: 'member',
    summary: 'Update a goal',
    params: z.object({ goalId: Id }),
    body: GoalInput.partial(),
    response: z.object({ goal: Goal }),
  }),
  deleteGoal: endpoint({
    method: 'DELETE',
    path: '/v1/wealth/goals/:goalId',
    auth: 'member',
    summary: 'Delete a goal',
    params: z.object({ goalId: Id }),
    response: Ok,
  }),

  // ── Insurance & wellness (features 4, 6) ──
  policies: endpoint({
    method: 'GET',
    path: '/v1/insurance/policies',
    auth: 'member',
    summary: 'Known policies including employer cover',
    response: z.object({ policies: z.array(InsurancePolicy) }),
  }),
  family: endpoint({
    method: 'GET',
    path: '/v1/insurance/family',
    auth: 'member',
    summary: 'Family members',
    response: z.object({ family: z.array(FamilyMember) }),
  }),
  addFamilyMember: endpoint({
    method: 'POST',
    path: '/v1/insurance/family',
    auth: 'member',
    summary: 'Add a family member',
    body: FamilyMemberInput,
    response: z.object({ member: FamilyMember }),
  }),
  removeFamilyMember: endpoint({
    method: 'DELETE',
    path: '/v1/insurance/family/:familyMemberId',
    auth: 'member',
    summary: 'Remove a family member',
    params: z.object({ familyMemberId: Id }),
    response: Ok,
  }),
  protectionGap: endpoint({
    method: 'GET',
    path: '/v1/insurance/protection-gap',
    auth: 'member',
    summary: 'Cover needed vs held; cheapest way to close the gap',
    response: ProtectionGap,
  }),
  healthQuote: endpoint({
    method: 'POST',
    path: '/v1/insurance/quotes',
    auth: 'member',
    summary: 'Family floater quote',
    body: z.object({ coverPaise: PositivePaise, familyMemberIds: z.array(Id).min(1) }),
    response: HealthQuote,
  }),
  claims: endpoint({
    method: 'GET',
    path: '/v1/insurance/claims',
    auth: 'member',
    summary: 'Claims concierge: tracked claims',
    response: z.object({ claims: z.array(Claim) }),
  }),
  fileClaim: endpoint({
    method: 'POST',
    path: '/v1/insurance/claims',
    auth: 'member',
    summary: 'File a claim through the concierge',
    body: ClaimInput,
    response: z.object({ claim: Claim }),
  }),
  wellness: endpoint({
    method: 'GET',
    path: '/v1/wellness',
    auth: 'member',
    summary: 'Activity score summary and premium reward',
    response: WellnessStatus,
  }),
  linkWearable: endpoint({
    method: 'POST',
    path: '/v1/wellness/link',
    auth: 'member',
    summary: 'Link a wearable (requires health_data permission)',
    body: z.object({ provider: WearableProvider }),
    response: WellnessStatus,
  }),
} as const;
