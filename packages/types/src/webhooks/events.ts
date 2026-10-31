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
import { ActivitySummary, EmiInstallment } from '../domain';

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
  z.object({ loanRef: Id, n: z.number().int().positive(), amountPaise: PositivePaise, onTime: z.boolean() }),
);

export const InsurerPolicyRenewalDue = base(
  'insurer.policy.renewal_due',
  'insurer',
  z.object({
    customerRef: Id,
    policyRef: Id,
    kind: PolicyKind,
    coverPaise: PositivePaise,
    renewalPremiumPaise: PositivePaise,
    renewalDate: IsoDate,
  }),
);

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
    annualPremiumPaise: PositivePaise,
    membersCovered: z.array(Relation),
    renewalDate: IsoDate,
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
  z.object({ redemptionRef: Id, clientRef: Id, amountPaise: PositivePaise, completedAt: IsoDateTime }),
);

export const WearableActivitySummary = base(
  'wearable.activity.summary',
  'wearable',
  z.object({ customerRef: Id, provider: WearableProvider, summary: ActivitySummary }),
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
  InsurerPolicyRenewalDue,
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
