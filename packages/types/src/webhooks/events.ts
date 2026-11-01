import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, PositivePaise } from '../common';
import {
  AaConsentStatus,
  AaFiType,
  ClaimStatus,
  LoanKind,
  Partner,
  PolicyKind,
  Relation,
  TxnCategory,
  UpiStatus,
  WearableProvider,
} from '../enums';
import { ActivitySummary, EmiInstallment, Vehicle } from '../domain';

/**
 * Events the outside world (ecosystem-api) sends to CRED. CRED learns nothing
 * about the ecosystem except through these and consented AA pulls.
 * `customerRef` is the partner's id for the person; CRED maps it to a member.
 */
const base = <T extends string, D extends z.ZodType>(type: T, partner: z.infer<typeof Partner>, data: D) =>
  z.object({
    id: Id,
    type: z.literal(type),
    partner: z.literal(partner),
    occurredAt: IsoDateTime,
    data,
  });

export const BankCardTransactionPosted = base(
  'bank.card.transaction.posted',
  'bank',
  z.object({
    customerRef: Id,
    cardRef: Id,
    transactionRef: Id,
    merchant: z.string(),
    category: TxnCategory,
    amountPaise: PositivePaise,
    postedAt: IsoDateTime,
    outstandingPaise: NonNegativePaise,
    limitPaise: PositivePaise,
  }),
);

export const BankCardStatementGenerated = base(
  'bank.card.statement.generated',
  'bank',
  z.object({
    customerRef: Id,
    cardRef: Id,
    statementRef: Id,
    periodStart: IsoDate,
    periodEnd: IsoDate,
    totalDuePaise: NonNegativePaise,
    minDuePaise: NonNegativePaise,
    dueDate: IsoDate,
    /** Card balance after the statement (includes any interest charged). */
    outstandingPaise: NonNegativePaise,
    interestPaise: NonNegativePaise,
  }),
);

export const BankCardPaymentReceived = base(
  'bank.card.payment.received',
  'bank',
  z.object({
    customerRef: Id,
    cardRef: Id,
    statementRef: Id,
    paymentRef: Id,
    amountPaise: PositivePaise,
    receivedAt: IsoDateTime,
    onTime: z.boolean(),
    outstandingPaise: NonNegativePaise,
    /** Paid at the bank (e.g. standing instruction) or by a lender clearing the balance. */
    paidBy: z.enum(['bank_autopay', 'lender']),
  }),
);

export const UpiTransactionCompleted = base(
  'upi.transaction.completed',
  'upi',
  z.object({
    upiTxnRef: Id,
    /** CRED's own payment id, echoed back by the switch. */
    clientRef: Id,
    status: UpiStatus,
    rrn: z.string().nullable(),
    failureReason: z.string().nullable(),
    amountPaise: PositivePaise,
    completedAt: IsoDateTime,
  }),
);

export const AaConsentUpdated = base(
  'aa.consent.updated',
  'aa',
  z.object({
    consentHandle: Id,
    consentId: Id.nullable(),
    status: AaConsentStatus,
    fiTypes: z.array(AaFiType),
  }),
);

export const AaFiReady = base(
  'aa.fi.ready',
  'aa',
  z.object({ consentHandle: Id, consentId: Id, sessionId: Id }),
);

export const LenderLoanDecided = base(
  'lender.loan.decided',
  'lender',
  z.object({
    applicationRef: Id,
    clientRef: Id,
    decision: z.enum(['approved', 'declined']),
    reason: z.string().nullable(),
    ratePaBps: Bps,
  }),
);

export const LenderLoanDisbursed = base(
  'lender.loan.disbursed',
  'lender',
  z.object({
    applicationRef: Id,
    loanRef: Id,
    clientRef: Id,
    kind: LoanKind,
    principalPaise: PositivePaise,
    ratePaBps: Bps,
    tenureMonths: z.number().int().positive(),
    emiPaise: PositivePaise,
    schedule: z.array(EmiInstallment),
    disbursedAt: IsoDateTime,
  }),
);

export const LenderEmiCollected = base(
  'lender.emi.collected',
  'lender',
  z.object({ loanRef: Id, clientRef: Id, n: z.number().int().positive(), amountPaise: PositivePaise, onTime: z.boolean() }),
);

/** An EMI couldn't be collected (not enough in the account); the lender retries next month. */
export const LenderEmiBounced = base(
  'lender.emi.bounced',
  'lender',
  z.object({ loanRef: Id, clientRef: Id, n: z.number().int().positive(), amountPaise: PositivePaise }),
);

/** Early repayment received: what's left of the loan (empty when closed). */
export const LenderLoanPrepaid = base(
  'lender.loan.prepaid',
  'lender',
  z.object({
    loanRef: Id,
    clientRef: Id,
    prepaymentRef: Id,
    amountPaise: PositivePaise,
    chargesPaise: NonNegativePaise,
    interestSavedPaise: NonNegativePaise,
    closed: z.boolean(),
    remaining: z.array(EmiInstallment),
  }),
);

/** Card-Balance Switch: the rate steps down after on-time payments; remaining instalments are re-priced. */
export const LenderLoanRepriced = base(
  'lender.loan.repriced',
  'lender',
  z.object({
    loanRef: Id,
    clientRef: Id,
    ratePaBps: Bps,
    afterOnTimePayments: z.number().int().positive(),
    remaining: z.array(EmiInstallment),
  }),
);

/** Loan against holdings: the pledged holdings' value moved and the loan is now this share of it. */
export const LenderCollateralAlert = base(
  'lender.collateral.alert',
  'lender',
  z.object({
    loanRef: Id,
    clientRef: Id,
    collateralValuePaise: NonNegativePaise,
    outstandingPaise: NonNegativePaise,
    loanToValueBps: Bps,
    maxLoanToValueBps: Bps,
    /** Prepay this much (or pledge more) to get back within the limit; 0 = nothing to do. */
    topUpNeededPaise: NonNegativePaise,
  }),
);

export const InsurerPolicyRenewalDue = base(
  'insurer.policy.renewal_due',
  'insurer',
  z.object({
    customerRef: Id,
    policyRef: Id,
    kind: PolicyKind,
    coverPaise: PositivePaise,
    /** What the member will pay, after any wellness discount. */
    renewalPremiumPaise: PositivePaise,
    basePremiumPaise: PositivePaise,
    wellnessDiscountPaise: NonNegativePaise,
    wellnessScore: z.number().int().min(0).max(100).nullable(),
    renewalDate: IsoDate,
  }),
);

/** The insurer renewed a policy and collected the premium (with any wellness discount applied). */
export const InsurerPolicyRenewed = base(
  'insurer.policy.renewed',
  'insurer',
  z.object({ policyRef: Id, renewedOn: IsoDate, premiumPaidPaise: NonNegativePaise, wellnessDiscountPaise: NonNegativePaise, nextRenewalDate: IsoDate }),
);

/** A policy bought through CRED was issued (clientRef = CRED's offer). Other policies reach CRED only through Account Aggregator. */
export const InsurerPolicyIssued = base(
  'insurer.policy.issued',
  'insurer',
  z.object({
    customerRef: Id,
    policyRef: Id,
    clientRef: Id.nullable(),
    insurerName: z.string(),
    productName: z.string(),
    kind: PolicyKind,
    coverPaise: PositivePaise,
    deductiblePaise: NonNegativePaise,
    annualPremiumPaise: PositivePaise,
    membersCovered: z.array(Relation),
    renewalDate: IsoDate,
    vehicle: Vehicle.nullable(),
  }),
);

export const InsurerClaimUpdated = base(
  'insurer.claim.updated',
  'insurer',
  z.object({ claimRef: Id, policyRef: Id, status: ClaimStatus, note: z.string(), at: IsoDateTime }),
);

export const FundhouseRedemptionCompleted = base(
  'fundhouse.redemption.completed',
  'fundhouse',
  z.object({
    redemptionRef: Id,
    clientRef: Id,
    folio: z.string(),
    schemeCode: z.string(),
    units: z.number().positive(),
    amountPaise: PositivePaise,
    completedAt: IsoDateTime,
  }),
);

export const WearableActivitySummary = base(
  'wearable.activity.summary',
  'wearable',
  /** clientRef: the sharing app's own id for the member, given when the link was made. */
  z.object({ customerRef: Id, clientRef: Id, provider: WearableProvider, summary: ActivitySummary }),
);

export const SimClockAdvanced = base(
  'sim.clock.advanced',
  'sim',
  z.object({ from: IsoDate, to: IsoDate }),
);

export const WebhookEvent = z.discriminatedUnion('type', [
  BankCardTransactionPosted,
  BankCardStatementGenerated,
  BankCardPaymentReceived,
  UpiTransactionCompleted,
  AaConsentUpdated,
  AaFiReady,
  LenderLoanDecided,
  LenderLoanDisbursed,
  LenderEmiCollected,
  LenderLoanRepriced,
  LenderCollateralAlert,
  LenderEmiBounced,
  LenderLoanPrepaid,
  InsurerPolicyRenewalDue,
  InsurerPolicyRenewed,
  InsurerPolicyIssued,
  InsurerClaimUpdated,
  FundhouseRedemptionCompleted,
  WearableActivitySummary,
  SimClockAdvanced,
]);
export type WebhookEvent = z.infer<typeof WebhookEvent>;
export type WebhookEventType = WebhookEvent['type'];
export type WebhookEventOf<T extends WebhookEventType> = Extract<WebhookEvent, { type: T }>;

export const WebhookAck = z.object({ received: z.literal(true), duplicate: z.boolean() });

export const WEBHOOK_HEADERS = {
  signature: 'x-sim-signature',
  timestamp: 'x-sim-timestamp',
  eventId: 'x-sim-event-id',
} as const;
