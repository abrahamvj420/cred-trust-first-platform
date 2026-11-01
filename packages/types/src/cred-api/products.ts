import { z } from 'zod';
import { Id, IsoDate, IsoDateTime, NonNegativePaise, Ok, PositivePaise } from '../common';
import { endpoint } from '../contract';
import {
  AcceptOption,
  Claim,
  Complaint,
  PrepaymentQuote,
  RepaymentPlanView,
  Vehicle,
  FamilyMember,
  FloaterComparison,
  Goal,
  HelpPlan,
  Holding,
  InsurancePolicy,
  KeyFactStatement,
  Loan,
  MemberAlert,
  Offer,
  PortfolioSummary,
  ProtectionGap,
  SellVsBorrow,
  WellnessStatus,
} from '../domain';
import { ComplaintCategory, DecisionOutcome, FeatureKey, Relation, TriggerOrigin, WearableProvider } from '../enums';

const OfferParams = z.object({ offerId: Id });

/** A decision as the member sees it: what happened and why, in plain English. */
export const MemberDecision = z.object({
  id: Id,
  feature: FeatureKey,
  origin: TriggerOrigin,
  outcome: DecisionOutcome,
  explanation: z.string(),
  offerId: Id.nullable(),
  createdAt: IsoDateTime,
});
export type MemberDecision = z.infer<typeof MemberDecision>;

export const OfferAcceptRequest = z.object({
  option: AcceptOption,
  /** Member has seen the key-fact screen. Must be set by an explicit tap. */
  keyFactsAcknowledged: z.literal(true),
});

/** After accept, the lender (e-sign) or insurer (proposal) sends an OTP; the member confirms with it. */
export const OfferAcceptResponse = z.object({
  offer: Offer,
  loan: Loan.nullable(),
  policy: InsurancePolicy.nullable(),
  otp: z.object({ sentTo: z.string(), demoOtp: z.string(), purpose: z.string() }),
});

export const GoalInput = z.object({
  name: z.string().trim().min(1).max(60),
  targetPaise: PositivePaise,
  targetDate: IsoDate,
  currentPaise: NonNegativePaise.default(0),
});

/** Partial update: only the fields sent change (no defaults applied). */
export const GoalPatch = z
  .object({ name: z.string().trim().min(1).max(60), targetPaise: PositivePaise, targetDate: IsoDate, currentPaise: NonNegativePaise })
  .partial();

export const FamilyMemberInput = z.object({
  name: z.string().trim().min(1).max(60),
  relation: Relation,
  age: z.number().int().min(0).max(110),
});

export const ClaimInput = z.object({
  policyId: Id,
  amountPaise: PositivePaise,
  description: z.string().trim().min(3).max(280),
});

export const GoldInput = z.object({
  grams: z.number().positive().max(10_000),
  costPaise: PositivePaise,
  acquiredOn: IsoDate,
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
    query: z.object({ option: AcceptOption }),
    response: KeyFactStatement,
  }),
  acceptOffer: endpoint({
    method: 'POST',
    path: '/v1/offers/:offerId/accept',
    auth: 'member',
    summary: 'Accept after seeing key facts; the partner then decides',
    params: OfferParams,
    body: OfferAcceptRequest,
    response: OfferAcceptResponse,
  }),
  confirmOffer: endpoint({
    method: 'POST',
    path: '/v1/offers/:offerId/confirm',
    auth: 'member',
    summary: 'Confirm with the lender’s e-sign OTP; the loan arrives by webhook',
    params: OfferParams,
    body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
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
  convertToEmi: endpoint({
    method: 'POST',
    path: '/v1/transactions/:transactionId/convert-to-emi',
    auth: 'member',
    summary: 'Member asks to convert a purchase to EMI (member-initiated; no Smart Savings needed)',
    params: z.object({ transactionId: Id }),
    response: z.object({ decision: MemberDecision, offer: Offer.nullable() }),
  }),
  decisions: endpoint({
    method: 'GET',
    path: '/v1/decisions',
    auth: 'member',
    summary: 'Why we did or didn’t suggest something, for this member',
    query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
    response: z.object({ decisions: z.array(MemberDecision) }),
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

  prepaymentQuote: endpoint({
    method: 'GET',
    path: '/v1/loans/:loanId/prepayment',
    auth: 'member',
    summary: 'What repaying early costs and saves (from the lender), before confirming',
    params: z.object({ loanId: Id }),
    query: z.object({ amountPaise: z.coerce.number().int().positive().optional(), full: z.enum(['true', 'false']).optional() }),
    response: PrepaymentQuote,
  }),
  prepay: endpoint({
    method: 'POST',
    path: '/v1/loans/:loanId/prepayments',
    auth: 'member',
    summary: 'Repay part or all of a loan early, from the member’s bank account; the lender confirms by webhook',
    params: z.object({ loanId: Id }),
    body: z.object({ amountPaise: PositivePaise.optional(), full: z.boolean().default(false) }).refine((b) => b.full || b.amountPaise !== undefined, { message: 'amountPaise or full' }),
    response: z.object({ quote: PrepaymentQuote, status: z.literal('requested') }),
  }),

  payOverdue: endpoint({
    method: 'POST',
    path: '/v1/loans/:loanId/pay-overdue',
    auth: 'member',
    summary: 'Pay a bounced EMI now, from the member’s bank account (the lender confirms by webhook)',
    params: z.object({ loanId: Id }),
    response: z.object({ amountPaise: PositivePaise, status: z.literal('requested') }),
  }),
  repaymentPlan: endpoint({
    method: 'GET',
    path: '/v1/repayment-plan',
    auth: 'member',
    summary: 'Plans to clear a carried card balance over 3, 6 or 12 months, vs carrying it',
    response: RepaymentPlanView,
  }),
  startRepaymentPlan: endpoint({
    method: 'POST',
    path: '/v1/repayment-plan',
    auth: 'member',
    summary: 'Choose a plan; the partner sends an OTP to confirm',
    body: z.object({ months: z.union([z.literal(3), z.literal(6), z.literal(12)]), termsAcknowledged: z.literal(true) }),
    response: z.object({ loanId: Id, otp: z.object({ sentTo: z.string(), demoOtp: z.string() }) }),
  }),
  confirmRepaymentPlan: endpoint({
    method: 'POST',
    path: '/v1/repayment-plan/:loanId/confirm',
    auth: 'member',
    summary: 'Confirm with the OTP; the partner clears the card and the plan appears in Loans',
    params: z.object({ loanId: Id }),
    body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
    response: z.object({ loanId: Id, status: z.literal('requested') }),
  }),

  // ── Wealth (features 2, 7) ──
  holdings: endpoint({
    method: 'GET',
    path: '/v1/wealth/holdings',
    auth: 'member',
    summary: 'Portfolio linked via Account Aggregator, plus self-declared gold; fees disclosed',
    response: PortfolioSummary,
  }),
  holding: endpoint({
    method: 'GET',
    path: '/v1/wealth/holdings/:holdingId',
    auth: 'member',
    summary: 'One holding',
    params: z.object({ holdingId: Id }),
    response: z.object({ holding: Holding }),
  }),
  addGold: endpoint({
    method: 'POST',
    path: '/v1/wealth/gold',
    auth: 'member',
    summary: 'Declare gold you own (Account Aggregator does not carry gold)',
    body: GoldInput,
    response: z.object({ holding: Holding }),
  }),
  removeHolding: endpoint({
    method: 'DELETE',
    path: '/v1/wealth/holdings/:holdingId',
    auth: 'member',
    summary: 'Remove a self-declared holding',
    params: z.object({ holdingId: Id }),
    response: Ok,
  }),
  sellIntent: endpoint({
    method: 'POST',
    path: '/v1/wealth/sell-intents',
    auth: 'member',
    summary: 'Member starts selling: returns sell vs borrow (member-initiated, through the engine)',
    body: z.object({ holdingId: Id, amountNeededPaise: PositivePaise, months: z.number().int().min(1).max(36) }),
    response: SellVsBorrow,
  }),
  sellIntentDetail: endpoint({
    method: 'GET',
    path: '/v1/wealth/sell-intents/:intentId',
    auth: 'member',
    summary: 'A sell-vs-borrow comparison already made',
    params: z.object({ intentId: Id }),
    response: SellVsBorrow,
  }),
  confirmSell: endpoint({
    method: 'POST',
    path: '/v1/wealth/sell-intents/:intentId/sell',
    auth: 'member',
    summary: 'Go ahead and sell (always allowed); the fund house confirms by webhook',
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
    body: GoalPatch,
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
    summary: 'Latest gap check: cover needed vs held, including employer cover',
    response: ProtectionGap,
  }),
  checkProtectionGap: endpoint({
    method: 'POST',
    path: '/v1/insurance/protection-gap',
    auth: 'member',
    summary: 'Member asks for a gap check now (member-initiated, through the engine)',
    response: ProtectionGap,
  }),
  healthQuote: endpoint({
    method: 'POST',
    path: '/v1/insurance/quotes',
    auth: 'member',
    summary: 'Family floater comparison from the insurer, waiting periods stated (member-initiated)',
    body: z.object({ coverPaise: PositivePaise, familyMemberIds: z.array(Id).min(1) }),
    response: FloaterComparison,
  }),
  claims: endpoint({
    method: 'GET',
    path: '/v1/insurance/claims',
    auth: 'member',
    summary: 'Claims concierge: tracked claims',
    response: z.object({ claims: z.array(Claim) }),
  }),
  claim: endpoint({
    method: 'GET',
    path: '/v1/insurance/claims/:claimId',
    auth: 'member',
    summary: 'One claim with its timeline',
    params: z.object({ claimId: Id }),
    response: z.object({ claim: Claim }),
  }),
  fileClaim: endpoint({
    method: 'POST',
    path: '/v1/insurance/claims',
    auth: 'member',
    summary: 'File a claim through the concierge; the insurer sends updates by webhook',
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
    summary: 'Link a health app (requires health_data permission); only weekly summaries are shared',
    body: z.object({ provider: WearableProvider }),
    response: WellnessStatus,
  }),

  declareVehicle: endpoint({
    method: 'POST',
    path: '/v1/insurance/vehicles',
    auth: 'member',
    summary: 'Member tells CRED what cover came with their car; CRED checks it (member-initiated)',
    body: z.object({
      vehicle: Vehicle,
      cover: z.enum(['comprehensive', 'third_party', 'not_sure']),
      annualPremiumPaise: PositivePaise.optional(),
    }),
    response: ProtectionGap,
  }),

  // ── Complaints ──
  complaints: endpoint({
    method: 'GET',
    path: '/v1/complaints',
    auth: 'member',
    summary: 'Concerns the member raised and their outcome',
    response: z.object({ complaints: z.array(Complaint) }),
  }),
  fileComplaint: endpoint({
    method: 'POST',
    path: '/v1/complaints',
    auth: 'member',
    summary: 'Raise a concern (about an offer, data, a claim, a payment …)',
    body: z.object({ category: ComplaintCategory, message: z.string().trim().min(5).max(600), offerId: Id.optional() }),
    response: z.object({ complaint: Complaint }),
  }),

  // ── Alerts (information, never offers) ──
  alerts: endpoint({
    method: 'GET',
    path: '/v1/alerts',
    auth: 'member',
    summary: 'Alerts for the member: market moves, claim updates, tier changes',
    response: z.object({ alerts: z.array(MemberAlert) }),
  }),
  readAlert: endpoint({
    method: 'POST',
    path: '/v1/alerts/:alertId/read',
    auth: 'member',
    summary: 'Mark an alert as read',
    params: z.object({ alertId: Id }),
    response: Ok,
  }),
} as const;
