import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, Paise, PositivePaise } from './common';
import {
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

export const BillPayment = z.object({
  id: Id,
  statementId: Id,
  kind: BillPaymentKind,
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
  createdAt: IsoDateTime,
});
export type UpiPayment = z.infer<typeof UpiPayment>;

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

export const InsuranceTerms = z.object({
  kind: z.literal('insurance'),
  insurerName: z.string(),
  productName: z.string(),
  coverPaise: PositivePaise,
  annualPremiumPaise: PositivePaise,
  membersCovered: z.array(Relation),
  wellnessRewardMaxPct: z.number().min(0).max(100),
});
export type InsuranceTerms = z.infer<typeof InsuranceTerms>;

export const AvailabilityTerms = z.object({
  kind: z.literal('availability'),
  description: z.string(),
});

export const OfferTerms = z.discriminatedUnion('kind', [LoanTerms, InsuranceTerms, AvailabilityTerms]);
export type OfferTerms = z.infer<typeof OfferTerms>;

export const Offer = z.object({
  id: Id,
  feature: FeatureKey,
  status: OfferStatus,
  origin: TriggerOrigin,
  headline: z.string(),
  subline: z.string(),
  /** The member's gain in paise. Always > 0 for a shown offer. */
  netBenefitPaise: PositivePaise,
  comparison: BenefitComparison,
  terms: OfferTerms,
  createdAt: IsoDateTime,
  decidedAt: IsoDateTime.nullable(),
});
export type Offer = z.infer<typeof Offer>;

/** Key Fact Statement shown before any acceptance (RBI-style). */
export const KeyFactStatement = z.object({
  offerId: Id,
  lenderOrInsurer: z.string(),
  items: z.array(z.object({ label: z.string(), value: z.string() })),
  annualPercentageRateBps: Bps.nullable(),
  totalCostPaise: NonNegativePaise,
  coolingOffDays: z.number().int().nonnegative(),
  grievanceContact: z.string(),
});
export type KeyFactStatement = z.infer<typeof KeyFactStatement>;

export const HelpPlan = z.object({
  id: Id,
  kind: z.enum(['repayment_plan', 'spend_alerts', 'talk_to_us']),
  title: z.string(),
  body: z.string(),
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
    }),
  ),
  nextTierInMonths: z.number().int().nonnegative().nullable(),
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

export const Holding = z.object({
  id: Id,
  kind: HoldingKind,
  name: z.string(),
  provider: z.string(),
  units: z.number().nonnegative().nullable(),
  valuePaise: NonNegativePaise,
  costPaise: NonNegativePaise,
  acquiredAt: IsoDate,
  expenseRatioBps: Bps.nullable(),
  expectedReturnBps: Bps,
});
export type Holding = z.infer<typeof Holding>;

export const SellVsBorrow = z.object({
  intentId: Id,
  holdingId: Id,
  amountNeededPaise: PositivePaise,
  months: z.number().int().positive(),
  sell: CostOption,
  borrow: CostOption,
  /** Positive = borrowing against the holding is cheaper than selling. */
  netBenefitPaise: Paise,
  recommendation: z.enum(['borrow', 'sell']),
});
export type SellVsBorrow = z.infer<typeof SellVsBorrow>;

export const Goal = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  targetPaise: PositivePaise,
  targetDate: IsoDate,
  currentPaise: NonNegativePaise,
  monthlyPlanPaise: NonNegativePaise,
  assumedReturnBps: Bps,
  annualFeesPaise: NonNegativePaise,
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
  annualPremiumPaise: NonNegativePaise,
  isEmployer: z.boolean(),
  employerName: z.string().nullable(),
  membersCovered: z.array(Relation),
  renewalDate: IsoDate.nullable(),
});
export type InsurancePolicy = z.infer<typeof InsurancePolicy>;

export const ProtectionGap = z.object({
  recommendedCoverPaise: PositivePaise,
  existingCoverPaise: NonNegativePaise,
  employerCoverPaise: NonNegativePaise,
  gapPaise: NonNegativePaise,
  rationale: z.array(z.string()),
  options: z.array(
    z.object({
      label: z.string(),
      kind: z.enum(['super_top_up', 'family_floater', 'increase_existing', 'none_needed']),
      addsCoverPaise: NonNegativePaise,
      annualPremiumPaise: NonNegativePaise,
      recommended: z.boolean(),
    }),
  ),
});
export type ProtectionGap = z.infer<typeof ProtectionGap>;

export const HealthQuote = z.object({
  quoteId: Id,
  insurerName: z.string(),
  productName: z.string(),
  coverPaise: PositivePaise,
  annualPremiumPaise: PositivePaise,
  members: z.array(z.object({ relation: Relation, age: z.number().int() })),
});
export type HealthQuote = z.infer<typeof HealthQuote>;

export const Claim = z.object({
  id: Id,
  policyId: Id,
  amountPaise: PositivePaise,
  description: z.string(),
  status: ClaimStatus,
  timeline: z.array(z.object({ status: ClaimStatus, at: IsoDateTime, note: z.string() })),
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
  rewardEarnedPaise: NonNegativePaise,
  rewardMaxPaise: NonNegativePaise,
});
export type WellnessStatus = z.infer<typeof WellnessStatus>;
