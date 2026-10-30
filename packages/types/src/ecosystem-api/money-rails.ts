import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, PositivePaise } from '../common';
import { endpoint } from '../contract';
import { AaConsentStatus, AaFiType, AaPurpose, GatewayPaymentStatus, PaymentMethod, PolicyKind, Relation, UpiStatus } from '../enums';

// ── /bank: Mock Bank (card issuer, accounts, salary credits) ──────────────────

export const CardAuthChallenge = z.object({
  authId: Id,
  bankName: z.string(),
  merchantName: z.string(),
  amountPaise: PositivePaise,
  cardMasked: z.string(),
  phoneMasked: z.string(),
  status: z.enum(['pending', 'approved', 'failed']),
  attemptsLeft: z.number().int().nonnegative(),
  /** Demo only: the OTP is shown on the page so the presenter can type it. */
  demoOtp: z.string().length(6),
});

export const BankOverview = z.object({
  customerRef: Id,
  name: z.string(),
  accounts: z.array(
    z.object({ accountRef: Id, accountMasked: z.string(), kind: z.enum(['savings', 'salary']), balancePaise: z.number().int() }),
  ),
  fixedDeposits: z.array(z.object({ fdRef: Id, principalPaise: PositivePaise, ratePaBps: Bps, maturesOn: IsoDate })),
  card: z
    .object({ cardRef: Id, last4: z.string(), limitPaise: PositivePaise, outstandingPaise: NonNegativePaise })
    .nullable(),
  recentTransactions: z.array(
    z.object({
      at: IsoDateTime,
      narration: z.string(),
      amountPaise: z.number().int(),
      kind: z.enum(['salary', 'debit', 'credit', 'emi', 'card_payment']),
    }),
  ),
  statements: z.array(
    z.object({
      statementRef: Id,
      periodEnd: IsoDate,
      totalDuePaise: NonNegativePaise,
      minDuePaise: NonNegativePaise,
      paidPaise: NonNegativePaise,
      dueDate: IsoDate,
    }),
  ),
});
export type BankOverview = z.infer<typeof BankOverview>;

export const bankEndpoints = {
  cardAuth: endpoint({
    method: 'GET',
    path: '/bank/v1/card-auth/:authId',
    auth: 'page',
    summary: '3-D Secure challenge details for the OTP page',
    params: z.object({ authId: Id }),
    response: CardAuthChallenge,
  }),
  submitOtp: endpoint({
    method: 'POST',
    path: '/bank/v1/card-auth/:authId/otp',
    auth: 'page',
    summary: 'Submit the card OTP',
    params: z.object({ authId: Id }),
    body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
    response: z.object({ status: z.enum(['approved', 'failed', 'pending']), attemptsLeft: z.number().int(), returnUrl: z.url().nullable() }),
  }),
  overview: endpoint({
    method: 'GET',
    path: '/bank/v1/customers/:customerRef/overview',
    auth: 'page',
    summary: 'Net-banking overview: accounts, salary credits, card statements',
    params: z.object({ customerRef: Id }),
    response: BankOverview,
  }),
  payCardBill: endpoint({
    method: 'POST',
    path: '/bank/v1/card-bill-payments',
    auth: 'partner',
    summary: 'Bill payment collected by CRED, credited to the card',
    body: z.object({
      cardRef: Id,
      statementRef: Id,
      amountPaise: PositivePaise,
      clientRef: Id,
    }),
    response: z.object({ paymentRef: Id, status: z.literal('received'), onTime: z.boolean(), outstandingPaise: NonNegativePaise }),
  }),
} as const;

// ── /gateway: payment gateway used by ShopKart ────────────────────────────────

export const GatewayPayment = z.object({
  paymentId: Id,
  orderId: z.string(),
  amountPaise: PositivePaise,
  method: PaymentMethod,
  status: GatewayPaymentStatus,
  failureReason: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type GatewayPayment = z.infer<typeof GatewayPayment>;

export const SavedCard = z.object({
  token: Id,
  last4: z.string().length(4),
  network: z.enum(['visa', 'mastercard', 'rupay']),
  issuerName: z.string(),
});

export const CreatePaymentRequest = z.object({
  orderId: z.string().min(1),
  amountPaise: PositivePaise,
  description: z.string().max(140),
  shopperPhone: z.string().regex(/^\d{10}$/),
  returnUrl: z.url(),
  instrument: z.discriminatedUnion('method', [
    z.object({ method: z.literal('card'), cardToken: Id }),
    z.object({ method: z.literal('upi'), vpa: z.string().regex(/^[\w.-]+@[\w]+$/) }),
  ]),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequest>;

export const gatewayEndpoints = {
  savedCards: endpoint({
    method: 'GET',
    path: '/gateway/v1/shoppers/:shopperPhone/saved-cards',
    auth: 'merchant',
    summary: 'Tokenised cards on file for a shopper',
    params: z.object({ shopperPhone: z.string().regex(/^\d{10}$/) }),
    response: z.object({ cards: z.array(SavedCard) }),
  }),
  createPayment: endpoint({
    method: 'POST',
    path: '/gateway/v1/payments',
    auth: 'merchant',
    summary: 'Create a payment; returns a redirect to OTP or UPI PIN',
    body: CreatePaymentRequest,
    response: z.object({
      payment: GatewayPayment,
      nextAction: z.object({ type: z.literal('redirect'), url: z.url() }).nullable(),
    }),
  }),
  payment: endpoint({
    method: 'GET',
    path: '/gateway/v1/payments/:paymentId',
    auth: 'merchant',
    summary: 'Payment status',
    params: z.object({ paymentId: Id }),
    response: z.object({ payment: GatewayPayment }),
  }),
} as const;

// ── /upi: mock UPI switch ─────────────────────────────────────────────────────

export const UpiPinChallenge = z.object({
  upiTxnRef: Id,
  payerVpa: z.string(),
  payerBank: z.string(),
  payeeVpa: z.string(),
  payeeName: z.string(),
  amountPaise: PositivePaise,
  note: z.string().nullable(),
  status: UpiStatus,
  initiatedVia: z.string(),
  /** Demo only: shown on the PIN page. */
  demoPin: z.string(),
});

export const upiEndpoints = {
  resolveVpa: endpoint({
    method: 'GET',
    path: '/upi/v1/vpa/:vpa',
    auth: 'partner',
    summary: 'Resolve a UPI ID to a name',
    params: z.object({ vpa: z.string() }),
    response: z.object({ vpa: z.string(), name: z.string().nullable(), valid: z.boolean() }),
  }),
  initiate: endpoint({
    method: 'POST',
    path: '/upi/v1/payments',
    auth: 'partner',
    summary: 'Initiate a UPI payment from a payment app (CRED)',
    body: z.object({
      payerVpa: z.string(),
      payeeVpa: z.string(),
      amountPaise: PositivePaise.max(1_00_000_00),
      note: z.string().max(50).nullable(),
      clientRef: Id,
      returnUrl: z.url(),
    }),
    response: z.object({ upiTxnRef: Id, status: UpiStatus, pinUrl: z.url() }),
  }),
  challenge: endpoint({
    method: 'GET',
    path: '/upi/v1/payments/:upiTxnRef',
    auth: 'page',
    summary: 'Details for the UPI PIN page',
    params: z.object({ upiTxnRef: Id }),
    response: UpiPinChallenge,
  }),
  submitPin: endpoint({
    method: 'POST',
    path: '/upi/v1/payments/:upiTxnRef/pin',
    auth: 'page',
    summary: 'Enter UPI PIN',
    params: z.object({ upiTxnRef: Id }),
    body: z.object({ pin: z.string().regex(/^\d{4,6}$/) }),
    response: z.object({ status: UpiStatus, rrn: z.string().nullable(), returnUrl: z.url() }),
  }),
} as const;

// ── /aa: Account Aggregator ───────────────────────────────────────────────────

export const FiData = z.object({
  consentId: Id,
  fetchedAt: IsoDateTime,
  deposits: z.array(
    z.object({
      fipName: z.string(),
      accountMasked: z.string(),
      transactions: z.array(
        z.object({ date: IsoDate, amountPaise: z.number().int(), kind: z.enum(['credit', 'debit']), narration: z.string() }),
      ),
    }),
  ),
  termDeposits: z.array(
    z.object({ fipName: z.string(), fdRef: Id, principalPaise: PositivePaise, ratePaBps: Bps, openedOn: IsoDate, maturesOn: IsoDate }),
  ),
  mutualFunds: z.array(
    z.object({
      amc: z.string(),
      folio: z.string(),
      schemeCode: z.string(),
      schemeName: z.string(),
      units: z.number().positive(),
      navPaise: PositivePaise,
      costPaise: NonNegativePaise,
      acquiredOn: IsoDate,
      expenseRatioBps: Bps,
      category: z.enum(['equity', 'debt', 'hybrid', 'gold']),
    }),
  ),
  insurance: z.array(
    z.object({
      insurerName: z.string(),
      policyRef: Id,
      productName: z.string(),
      kind: PolicyKind,
      coverPaise: PositivePaise,
      annualPremiumPaise: NonNegativePaise,
      isEmployer: z.boolean(),
      employerName: z.string().nullable(),
      membersCovered: z.array(Relation),
      renewalDate: IsoDate.nullable(),
    }),
  ),
});
export type FiData = z.infer<typeof FiData>;

export const AaConsentDetail = z.object({
  consentHandle: Id,
  fiuName: z.string(),
  purpose: AaPurpose,
  purposeText: z.string(),
  fiTypes: z.array(AaFiType),
  dataRangeMonths: z.number().int().positive(),
  validForMonths: z.number().int().positive(),
  status: AaConsentStatus,
  customerName: z.string(),
  accounts: z.array(z.object({ accountRef: Id, fipName: z.string(), fiType: AaFiType, masked: z.string() })),
});

export const aaEndpoints = {
  createConsent: endpoint({
    method: 'POST',
    path: '/aa/v1/consents',
    auth: 'partner',
    summary: 'FIU (CRED) requests consent',
    body: z.object({
      customerAaHandle: z.string().regex(/^\d{10}@simaa$/),
      purpose: AaPurpose,
      fiTypes: z.array(AaFiType).min(1),
      dataRangeMonths: z.number().int().min(1).max(24),
      clientRef: Id,
      redirectUrl: z.url(),
    }),
    response: z.object({ consentHandle: Id, status: AaConsentStatus, approvalUrl: z.url() }),
  }),
  consent: endpoint({
    method: 'GET',
    path: '/aa/v1/consents/:consentHandle',
    auth: 'page',
    summary: 'Consent detail for the AA approval page',
    params: z.object({ consentHandle: Id }),
    response: AaConsentDetail,
  }),
  decide: endpoint({
    method: 'POST',
    path: '/aa/v1/consents/:consentHandle/decision',
    auth: 'page',
    summary: 'Customer approves or rejects on the AA page',
    params: z.object({ consentHandle: Id }),
    body: z.object({ decision: z.enum(['approve', 'reject']), accountRefs: z.array(Id) }),
    response: z.object({ status: AaConsentStatus, redirectUrl: z.url() }),
  }),
  revoke: endpoint({
    method: 'DELETE',
    path: '/aa/v1/consents/:consentHandle',
    auth: 'partner',
    summary: 'Revoke consent',
    params: z.object({ consentHandle: Id }),
    response: z.object({ status: AaConsentStatus }),
  }),
  fetch: endpoint({
    method: 'POST',
    path: '/aa/v1/fi/fetch',
    auth: 'partner',
    summary: 'Fetch financial information under an active consent',
    body: z.object({ consentId: Id, sessionId: Id }),
    response: FiData,
  }),
} as const;
