import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, Paise, PositivePaise } from './common';
import {
  AlertKind,
  ComplaintCategory,
  AaConsentStatus,
  AaFiType,
  AaPurpose,
  AuditActor,
  BillPaymentKind,
  ClaimStatus,
  CreditTier,
  DecisionOutcome,
  EngineCheck,
  FeatureKey,
  HoldingKind,
  InstallmentStatus,
  LoanKind,
  LoanStatus,
  OfferStatus,
  PermissionScope,
  PermissionStatus,
  PersonaKey,
  PolicyKind,
  ReasonCode,
  Relation,
  StatementStatus,
  StressSignal,
  TriggerOrigin,
  TxnCategory,
  UpiStatus,
  WearableProvider,
} from './enums';

// ── Member & cards ────────────────────────────────────────────────────────────

export const Member = z.object({
  id: Id,
  personaKey: PersonaKey,
  name: z.string(),
  phoneMasked: z.string(),
  city: z.string(),
  memberSince: IsoDate,
  /** The member's own UPI ID (pays bills and UPI from their bank account). */
  vpa: z.string(),
});
export type Member = z.infer<typeof Member>;

export const PersonaSummary = z.object({
  key: PersonaKey,
  name: z.string(),
  city: z.string(),
  tagline: z.string(),
});
export type PersonaSummary = z.infer<typeof PersonaSummary>;

export const Card = z.object({
  id: Id,
  issuerName: z.string(),
  network: z.enum(['visa', 'mastercard', 'rupay']),
  last4: z.string().length(4),
  limitPaise: PositivePaise,
  outstandingPaise: NonNegativePaise,
  availablePaise: NonNegativePaise,
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  /** Outstanding ÷ limit, in basis points. */
  utilisationBps: z.number().int().nonnegative(),
  /** The latest statement and what's still due on it; null before the first statement. */
  nextDue: z
    .object({
      statementId: Id,
      totalDuePaise: NonNegativePaise,
      minDuePaise: NonNegativePaise,
      paidPaise: NonNegativePaise,
      remainingPaise: NonNegativePaise,
      dueDate: IsoDate,
      status: z.enum(['open', 'paid', 'partial', 'unpaid', 'overdue']),
    })
    .nullable(),
});
export type Card = z.infer<typeof Card>;

export const CardTransaction = z.object({
  id: Id,
  cardId: Id,
  merchant: z.string(),
  category: TxnCategory,
  amountPaise: PositivePaise,
  postedAt: IsoDateTime,
});
export type CardTransaction = z.infer<typeof CardTransaction>;

export const Statement = z.object({
  id: Id,
  cardId: Id,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  totalDuePaise: NonNegativePaise,
  minDuePaise: NonNegativePaise,
  paidPaise: NonNegativePaise,
  dueDate: IsoDate,
  status: StatementStatus,
});
export type Statement = z.infer<typeof Statement>;

export const BillPaymentSource = z.enum(['upi', 'netbanking']);
export type BillPaymentSource = z.infer<typeof BillPaymentSource>;

export const BillPayment = z.object({
  id: Id,
  statementId: Id,
  kind: BillPaymentKind,
  source: BillPaymentSource.nullable(),
  amountPaise: PositivePaise,
  paidAt: IsoDateTime,
  onTime: z.boolean(),
});
export type BillPayment = z.infer<typeof BillPayment>;

export const UpiPayment = z.object({
  id: Id,
  payerVpa: z.string(),
  payeeVpa: z.string(),
  payeeName: z.string().nullable(),
  amountPaise: PositivePaise,
  note: z.string().nullable(),
  status: UpiStatus,
  rrn: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type UpiPayment = z.infer<typeof UpiPayment>;

export const UpiContact = z.object({
  name: z.string(),
  vpa: z.string(),
  /** Paid from CRED before. */
  recent: z.boolean(),
});
export type UpiContact = z.infer<typeof UpiContact>;

// ── Rewards ───────────────────────────────────────────────────────────────────

export const RewardEntry = z.object({
  id: Id,
  kind: z.enum(['earned', 'redeemed', 'opening']),
  coins: z.number().int(),
  description: z.string(),
  at: IsoDateTime,
});
export type RewardEntry = z.infer<typeof RewardEntry>;

export const RewardItem = z.object({
  id: Id,
  title: z.string(),
  brand: z.string(),
  description: z.string(),
  costCoins: z.number().int().positive(),
  valuePaise: PositivePaise,
});
export type RewardItem = z.infer<typeof RewardItem>;

// ── Permissions & audit ───────────────────────────────────────────────────────

export const Permission = z.object({
  scope: PermissionScope,
  status: PermissionStatus,
  grantedAt: IsoDateTime.nullable(),
  withdrawnAt: IsoDateTime.nullable(),
  /** The moment the member granted it, e.g. "Big purchase at ShopKart". */
  context: z.string().nullable(),
});
export type Permission = z.infer<typeof Permission>;

export const AuditEntry = z.object({
  id: Id,
  memberId: Id.nullable(),
  actor: AuditActor,
  action: z.string(),
  target: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  at: IsoDateTime,
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AaConsent = z.object({
  id: Id,
  purpose: AaPurpose,
  fiTypes: z.array(AaFiType),
  status: AaConsentStatus,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
});
export type AaConsent = z.infer<typeof AaConsent>;

// ── Engine decisions & offers ─────────────────────────────────────────────────

export const CheckResult = z.object({
  check: EngineCheck,
  passed: z.boolean(),
  reason: ReasonCode,
  detail: z.string(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const EngineDecision = z.object({
  id: Id,
  memberId: Id,
  feature: FeatureKey,
  origin: TriggerOrigin,
  triggerEventId: Id.nullable(),
  outcome: DecisionOutcome,
  reasons: z.array(ReasonCode),
  checks: z.array(CheckResult),
  stressSignals: z.array(StressSignal),
  netBenefitPaise: Paise.nullable(),
  offerId: Id.nullable(),
  /** Plain-English "why am I seeing this / why not". */
  explanation: z.string(),
  createdAt: IsoDateTime,
});
export type EngineDecision = z.infer<typeof EngineDecision>;

export const BenefitLine = z.object({
  label: z.string(),
  amountPaise: Paise,
  kind: z.enum(['interest', 'tax', 'fee', 'lost_return', 'premium', 'reward', 'other']),
});
export type BenefitLine = z.infer<typeof BenefitLine>;

export const CostOption = z.object({
  label: z.string(),
  totalCostPaise: NonNegativePaise,
  lines: z.array(BenefitLine),
});
export type CostOption = z.infer<typeof CostOption>;

/** "What you pay today" vs "what you'd pay with this". netBenefit = current − proposed. */
export const BenefitComparison = z.object({
  current: CostOption,
  proposed: CostOption,
  netBenefitPaise: Paise,
});
export type BenefitComparison = z.infer<typeof BenefitComparison>;

export const LoanTerms = z.object({
  kind: z.literal('loan'),
  loanKind: LoanKind,
  lenderName: z.string(),
  principalPaise: PositivePaise,
  ratePaBps: Bps,
  tenureMonths: z.number().int().positive(),
  emiPaise: PositivePaise,
  processingFeePaise: NonNegativePaise,
  gstOnFeePaise: NonNegativePaise,
  totalInterestPaise: NonNegativePaise,
  /** Card-Balance Switch: rate steps down after on-time payments. */
  rateStepDown: z
    .array(z.object({ afterOnTimePayments: z.number().int().positive(), ratePaBps: Bps }))
    .optional(),
});
export type LoanTerms = z.infer<typeof LoanTerms>;

/** Waiting periods are stated plainly on every health quote, never hidden in the wording. */
export const WaitingPeriod = z.object({ label: z.string(), detail: z.string(), days: z.number().int().nonnegative() });
export type WaitingPeriod = z.infer<typeof WaitingPeriod>;

export const Vehicle = z.object({
  registration: z.string(),
  makeModel: z.string(),
  year: z.number().int(),
  /** Insured declared value. */
  idvPaise: PositivePaise,
});
export type Vehicle = z.infer<typeof Vehicle>;

export const InsuranceProductKind = z.enum(['family_floater', 'super_top_up', 'motor_own_damage', 'motor_comprehensive']);
export type InsuranceProductKind = z.infer<typeof InsuranceProductKind>;

export const InsuranceTerms = z.object({
  kind: z.literal('insurance'),
  productKind: InsuranceProductKind,
  insurerName: z.string(),
  productName: z.string(),
  coverPaise: PositivePaise,
  /** Super top-up: pays only above this amount in a year. */
  deductiblePaise: NonNegativePaise,
  annualPremiumPaise: PositivePaise,
  /** Individual health cover is GST-exempt; motor cover carries 18%. Included in the premium above. */
  gstPaise: NonNegativePaise,
  members: z.array(z.object({ relation: Relation, age: z.number().int() })),
  waitingPeriods: z.array(WaitingPeriod),
  vehicle: Vehicle.nullable(),
  wellnessRewardMaxPct: z.number().min(0).max(100),
  freeLookDays: z.number().int().nonnegative(),
});
export type InsuranceTerms = z.infer<typeof InsuranceTerms>;

export const AvailabilityTerms = z.object({
  kind: z.literal('availability'),
  description: z.string(),
});

export const OfferTerms = z.discriminatedUnion('kind', [LoanTerms, InsuranceTerms, AvailabilityTerms]);
export type OfferTerms = z.infer<typeof OfferTerms>;

/** Options a member can accept on an offer. */
export const AcceptOption = z.enum(['emi', 'loan', 'policy', 'policy_alt']);
export type AcceptOptionKey = z.infer<typeof AcceptOption>;

/** One row of the side-by-side comparison (pay in full / card / EMI / loan / sell / policy …). */
export const OfferOption = z.object({
  key: z.enum(['pay_in_full', 'card_revolve', 'emi', 'loan', 'sell', 'policy', 'policy_alt', 'no_change']),
  label: z.string(),
  totalCostPaise: NonNegativePaise,
  monthlyPaise: NonNegativePaise.nullable(),
  lines: z.array(BenefitLine),
  /** Only EMI, loan and policy options can be accepted. */
  acceptable: z.boolean(),
  recommended: z.boolean(),
  note: z.string().nullable(),
  terms: z.discriminatedUnion('kind', [LoanTerms, InsuranceTerms]).nullable(),
});
export type OfferOption = z.infer<typeof OfferOption>;
export type AcceptableOptionKey = AcceptOptionKey;

export const Offer = z.object({
  id: Id,
  feature: FeatureKey,
  status: OfferStatus,
  origin: TriggerOrigin,
  headline: z.string(),
  subline: z.string(),
  /** The member's gain in paise. Always > 0 for a shown offer. */
  netBenefitPaise: PositivePaise,
  /** What the saving is measured against, e.g. "less than card interest". */
  benefitLabel: z.string(),
  comparison: BenefitComparison,
  options: z.array(OfferOption),
  terms: OfferTerms,
  /** What prompted it: a purchase, a bill, a holding or a policy, with the amount involved. */
  trigger: z.object({ merchant: z.string(), amountPaise: PositivePaise }).nullable(),
  /** Plain-English "why am I seeing this". */
  why: z.string(),
  createdAt: IsoDateTime,
  decidedAt: IsoDateTime.nullable(),
});
export type Offer = z.infer<typeof Offer>;

/** Key Fact Statement shown before any acceptance (RBI-style). */
export const KeyFactStatement = z.object({
  offerId: Id,
  option: AcceptOption,
  /** Loan agreement or insurance proposal. */
  kind: z.enum(['loan', 'insurance']),
  lenderOrInsurer: z.string(),
  items: z.array(z.object({ label: z.string(), value: z.string() })),
  annualPercentageRateBps: Bps.nullable(),
  totalCostPaise: NonNegativePaise,
  coolingOffDays: z.number().int().nonnegative(),
  grievanceContact: z.string(),
  /** Plain-language points to read before saying yes (waiting periods, lien on holdings …). */
  highlights: z.array(z.string()),
});
export type KeyFactStatement = z.infer<typeof KeyFactStatement>;

export const HelpPlan = z.object({
  id: Id,
  kind: z.enum(['repayment_plan', 'spend_alerts', 'talk_to_us']),
  title: z.string(),
  body: z.string(),
  monthlyInterestPaise: NonNegativePaise.nullable(),
  createdAt: IsoDateTime,
});
export type HelpPlan = z.infer<typeof HelpPlan>;

// ── Loans ─────────────────────────────────────────────────────────────────────

export const EmiInstallment = z.object({
  n: z.number().int().positive(),
  dueDate: IsoDate,
  amountPaise: PositivePaise,
  principalPaise: NonNegativePaise,
  interestPaise: NonNegativePaise,
  status: InstallmentStatus,
});
export type EmiInstallment = z.infer<typeof EmiInstallment>;

export const Loan = z.object({
  id: Id,
  /** Interest saved by repaying early. */
  interestSavedPaise: NonNegativePaise.default(0),
  principalOutstandingPaise: NonNegativePaise.default(0),
  offerId: Id.nullable(),
  kind: LoanKind,
  lenderName: z.string(),
  principalPaise: PositivePaise,
  ratePaBps: Bps,
  tenureMonths: z.number().int().positive(),
  emiPaise: PositivePaise,
  status: LoanStatus,
  createdAt: IsoDateTime,
  schedule: z.array(EmiInstallment),
});
export type Loan = z.infer<typeof Loan>;

/** The credit a member could use: from the ladder, raised by verified salary. Shown as available, never pushed. */
export const CreditLine = z.object({
  limitPaise: NonNegativePaise,
  ratePaBps: Bps,
  basis: z.enum(['ladder', 'salary_verified']),
  /** False while the member is clearing a balance: help first, not credit. */
  shown: z.boolean(),
  note: z.string(),
});
export type CreditLine = z.infer<typeof CreditLine>;

export const LadderStatus = z.object({
  tier: CreditTier,
  onTimeStreak: z.number().int().nonnegative(),
  tiers: z.array(
    z.object({
      tier: CreditTier,
      requiredOnTimeMonths: z.number().int().nonnegative(),
      limitPaise: NonNegativePaise,
      ratePaBps: Bps,
      unlocked: z.boolean(),
      current: z.boolean(),
    }),
  ),
  /** On-time, in-full payments still needed for the next tier (null at the top). */
  nextTierInMonths: z.number().int().nonnegative().nullable(),
  nextTier: CreditTier.nullable(),
  creditLine: CreditLine,
  /** Recent bills and whether each counted towards the streak. */
  history: z.array(
    z.object({
      periodEnd: IsoDate,
      dueDate: IsoDate,
      outcome: z.enum(['paid_in_full', 'part_paid', 'missed', 'open']),
      counted: z.boolean(),
    }),
  ),
  howItWorks: z.array(z.string()),
});
export type LadderStatus = z.infer<typeof LadderStatus>;

export const IncomeProfile = z.object({
  monthlyNetPaise: PositivePaise,
  employer: z.string(),
  monthsVerified: z.number().int().positive(),
  verifiedAt: IsoDateTime,
});
export type IncomeProfile = z.infer<typeof IncomeProfile>;

// ── Wealth ────────────────────────────────────────────────────────────────────

export const AssetClass = z.enum(['equity', 'debt', 'hybrid', 'gold', 'fixed_deposit']);
export type AssetClass = z.infer<typeof AssetClass>;

export const Holding = z.object({
  id: Id,
  kind: HoldingKind,
  assetClass: AssetClass,
  name: z.string(),
  provider: z.string(),
  /** Linked through Account Aggregator, or told to CRED by the member (gold). */
  source: z.enum(['aa', 'self_declared']),
  units: z.number().nonnegative().nullable(),
  valuePaise: NonNegativePaise,
  costPaise: NonNegativePaise,
  acquiredAt: IsoDate,
  expenseRatioBps: Bps.nullable(),
  /** Fees paid to the fund house each year at today's value (disclosed; CRED earns none of it). */
  annualFeePaise: NonNegativePaise,
  expectedReturnBps: Bps,
  /** Units pledged against a loan; these can't be sold until the loan is repaid. */
  pledged: z.boolean(),
});
export type Holding = z.infer<typeof Holding>;

export const PortfolioSummary = z.object({
  linked: z.boolean(),
  holdings: z.array(Holding),
  totalValuePaise: NonNegativePaise,
  totalCostPaise: NonNegativePaise,
  gainPaise: Paise,
  annualFeesPaise: NonNegativePaise,
  allocation: z.array(z.object({ assetClass: AssetClass, label: z.string(), valuePaise: NonNegativePaise, shareBps: Bps })),
  lastFetchedAt: IsoDateTime.nullable(),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummary>;

export const SellVsBorrow = z.object({
  intentId: Id,
  decisionId: Id,
  holdingId: Id,
  holdingName: z.string(),
  amountNeededPaise: PositivePaise,
  months: z.number().int().positive(),
  sell: CostOption,
  /** Null when borrowing isn't possible here (e.g. above the safe share of value). */
  borrow: CostOption.nullable(),
  /** Most you could borrow against this holding: a conservative share of its value. */
  maxBorrowPaise: NonNegativePaise,
  loanToValueBps: Bps,
  /** Positive = borrowing against the holding is cheaper than selling. */
  netBenefitPaise: Paise,
  recommendation: z.enum(['borrow', 'sell']),
  explanation: z.string(),
  /** The borrow option as an offer (key facts → lender), when borrowing is cheaper and allowed. */
  offerId: Id.nullable(),
  status: z.enum(['open', 'sold', 'borrowed', 'abandoned']),
});
export type SellVsBorrow = z.infer<typeof SellVsBorrow>;

export const Goal = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  targetPaise: PositivePaise,
  targetDate: IsoDate,
  /** Already set aside for this goal (member's own figure). */
  currentPaise: NonNegativePaise,
  monthsLeft: z.number().int().nonnegative(),
  /** What the amount set aside grows to by the target date at the assumed return. */
  projectedPaise: NonNegativePaise,
  /** Monthly investment needed to reach the target. Guidance only, no product attached. */
  monthlyPlanPaise: NonNegativePaise,
  assumedReturnBps: Bps,
  /** Fund fees over the plan, at the member's average expense ratio. */
  annualFeesPaise: NonNegativePaise,
  feeRateBps: Bps,
  onTrack: z.boolean(),
});
export type Goal = z.infer<typeof Goal>;

// ── Insurance & wellness ──────────────────────────────────────────────────────

export const FamilyMember = z.object({
  id: Id,
  name: z.string(),
  relation: Relation,
  age: z.number().int().min(0).max(110),
});
export type FamilyMember = z.infer<typeof FamilyMember>;

export const InsurancePolicy = z.object({
  id: Id,
  insurerName: z.string(),
  productName: z.string(),
  kind: PolicyKind,
  coverPaise: PositivePaise,
  deductiblePaise: NonNegativePaise,
  annualPremiumPaise: NonNegativePaise,
  isEmployer: z.boolean(),
  employerName: z.string().nullable(),
  membersCovered: z.array(Relation),
  renewalDate: IsoDate.nullable(),
  /** Read through Account Aggregator, bought through CRED, or told to CRED by the member (e.g. a car's cover). */
  source: z.enum(['aa', 'cred_purchase', 'self_declared']),
  vehicle: Vehicle.nullable(),
  /** Premium saved at renewals by the wellness reward. */
  wellnessSavedPaise: NonNegativePaise,
  lastRenewedOn: IsoDate.nullable(),
});
export type InsurancePolicy = z.infer<typeof InsurancePolicy>;

export const GapArea = z.object({
  area: z.enum(['health', 'motor']),
  title: z.string(),
  /** Cover we'd suggest for this need, and how we got there. */
  needPaise: NonNegativePaise,
  existingPaise: NonNegativePaise,
  /** Part of the existing cover that comes from an employer (ends if you change jobs). */
  employerPaise: NonNegativePaise,
  gapPaise: NonNegativePaise,
  covered: z.boolean(),
  rationale: z.array(z.string()),
  vehicle: Vehicle.nullable(),
});
export type GapArea = z.infer<typeof GapArea>;

export const ProtectionGap = z.object({
  /** Can CRED read the member's cover (policies linked through Account Aggregator)? */
  linked: z.boolean(),
  checkedOn: IsoDate,
  areas: z.array(GapArea),
  explanation: z.string(),
  /** The cheapest way to close the gap, as an offer with every option side by side; null when covered. */
  offerId: Id.nullable(),
});
export type ProtectionGap = z.infer<typeof ProtectionGap>;

/** Family floater comparison from the insurer: one floater for everyone vs. a separate one for parents. */
export const FloaterComparison = z.object({
  members: z.array(z.object({ name: z.string(), relation: Relation, age: z.number().int() })),
  coverPaise: PositivePaise,
  options: z.array(
    z.object({
      key: z.enum(['policy', 'policy_alt']),
      label: z.string(),
      totalPremiumPaise: PositivePaise,
      policies: z.array(InsuranceTerms),
      recommended: z.boolean(),
      note: z.string(),
    }),
  ),
  waitingPeriods: z.array(WaitingPeriod),
  netBenefitPaise: Paise,
  explanation: z.string(),
  offerId: Id.nullable(),
});
export type FloaterComparison = z.infer<typeof FloaterComparison>;

export const Claim = z.object({
  id: Id,
  policyId: Id,
  policyName: z.string(),
  insurerName: z.string(),
  amountPaise: PositivePaise,
  description: z.string(),
  status: ClaimStatus,
  timeline: z.array(z.object({ status: ClaimStatus, at: IsoDateTime, note: z.string() })),
  /** What happens next, in plain English. */
  nextStep: z.string(),
  createdAt: IsoDateTime,
});
export type Claim = z.infer<typeof Claim>;

/** Summary only: CRED never receives raw step data. */
export const ActivitySummary = z.object({
  weekStart: IsoDate,
  avgDailySteps: z.number().int().nonnegative(),
  activeDays: z.number().int().min(0).max(7),
  score: z.number().int().min(0).max(100),
});
export type ActivitySummary = z.infer<typeof ActivitySummary>;

export const WellnessStatus = z.object({
  linked: z.boolean(),
  provider: WearableProvider.nullable(),
  latest: ActivitySummary.nullable(),
  weeks: z.array(ActivitySummary),
  /** Average of the last four weekly scores. */
  averageScore: z.number().int().min(0).max(100).nullable(),
  /** Reward on the next renewal premium, as a share and in rupees. */
  rewardPct: z.number().min(0).max(100),
  rewardEarnedPaise: NonNegativePaise,
  rewardMaxPaise: NonNegativePaise,
  policyName: z.string().nullable(),
  renewalDate: IsoDate.nullable(),
  /** Saved so far at renewals, applied by the insurer. */
  rewardSavedPaise: NonNegativePaise,
  lastRenewal: z.object({ on: IsoDate, premiumPaidPaise: NonNegativePaise, savedPaise: NonNegativePaise }).nullable(),
  /** Exactly what the health app shares with CRED, and what it never shares. */
  shared: z.array(z.string()),
  neverShared: z.array(z.string()),
});
export type WellnessStatus = z.infer<typeof WellnessStatus>;

// ── Early repayment ───────────────────────────────────────────────────────────

/** What repaying early costs and saves, from the lender, before the member confirms. */
export const PrepaymentQuote = z.object({
  loanId: Id,
  full: z.boolean(),
  principalOutstandingPaise: NonNegativePaise,
  /** Principal repaid now (plus any interest accrued is nil: EMIs are monthly). */
  amountPaise: PositivePaise,
  chargesPaise: NonNegativePaise,
  chargesNote: z.string(),
  /** Interest the member no longer pays. */
  interestSavedPaise: NonNegativePaise,
  totalToPayPaise: PositivePaise,
  /** After a part payment: the EMI stays the same and the loan ends sooner. */
  remainingInstalments: z.number().int().nonnegative(),
  newEndDate: IsoDate.nullable(),
});
export type PrepaymentQuote = z.infer<typeof PrepaymentQuote>;

/** A plan to clear a carried card balance: help, not new credit. */
export const RepaymentPlanOption = z.object({
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  monthlyPaise: PositivePaise,
  totalInterestPaise: NonNegativePaise,
  ratePaBps: Bps,
  /** Interest if the same balance stayed on the card and was paid off over the same months. */
  cardInterestPaise: NonNegativePaise,
  savingPaise: Paise,
});
export type RepaymentPlanOption = z.infer<typeof RepaymentPlanOption>;

export const RepaymentPlanView = z.object({
  eligible: z.boolean(),
  /** Why not (supportive), when not eligible. */
  note: z.string(),
  balancePaise: NonNegativePaise,
  lenderName: z.string(),
  options: z.array(RepaymentPlanOption),
  activeLoanId: Id.nullable(),
});
export type RepaymentPlanView = z.infer<typeof RepaymentPlanView>;

// ── Complaints ────────────────────────────────────────────────────────────────

export const Complaint = z.object({
  id: Id,
  category: ComplaintCategory,
  message: z.string(),
  offerId: Id.nullable(),
  status: z.enum(['open', 'resolved']),
  resolution: z.string().nullable(),
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
});
export type Complaint = z.infer<typeof Complaint>;

// ── Alerts ────────────────────────────────────────────────────────────────────

/** Information for the member (a market fall, a claim update). Never an offer. */
export const MemberAlert = z.object({
  id: Id,
  kind: AlertKind,
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  read: z.boolean(),
  createdAt: IsoDateTime,
});
export type MemberAlert = z.infer<typeof MemberAlert>;
