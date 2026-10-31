import { z } from 'zod';
import { Id, IsoDateTime, NonNegativePaise, Ok, PositivePaise } from '../common';
import { endpoint } from '../contract';
import {
  AaConsent,
  BillPayment,
  BillPaymentSource,
  Card,
  CardTransaction,
  IncomeProfile,
  LadderStatus,
  Member,
  Offer,
  Permission,
  PersonaSummary,
  Statement,
  RewardEntry,
  RewardItem,
  UpiContact,
  UpiPayment,
} from '../domain';
import { AaPurpose, BillPaymentKind, PermissionScope, PersonaKey } from '../enums';

const CardParams = z.object({ cardId: Id });

export const HomeSummary = z.object({
  member: Member,
  cards: z.array(Card),
  /** The single active offer, if any. Never more than one. */
  activeOffer: Offer.nullable(),
  nextBill: z
    .object({ cardId: Id, statementId: Id, totalDuePaise: NonNegativePaise, dueDate: z.string() })
    .nullable(),
  smartSavingsGranted: z.boolean(),
  rewardsCoins: z.number().int().nonnegative(),
  /** Today in the simulated world, for "due in N days". */
  simDate: z.iso.date(),
});
export type HomeSummary = z.infer<typeof HomeSummary>;

export const StatementDetail = Statement.extend({
  transactions: z.array(CardTransaction),
  payments: z.array(BillPayment),
});
export type StatementDetail = z.infer<typeof StatementDetail>;

export const BillPayRequest = z
  .object({
    kind: BillPaymentKind,
    source: BillPaymentSource,
    /** Required for kind=custom; ignored otherwise. */
    amountPaise: PositivePaise.optional(),
  })
  .refine((b) => b.kind !== 'custom' || b.amountPaise !== undefined, {
    message: 'amountPaise is required for a custom payment',
    path: ['amountPaise'],
  });
export type BillPayRequest = z.infer<typeof BillPayRequest>;

export const BillPayResponse = z.object({
  payment: BillPayment,
  statement: Statement,
  card: Card,
  coinsEarned: z.number().int().nonnegative(),
});

export const CardDetail = z.object({
  card: Card,
  statement: Statement.nullable(),
  payments: z.array(BillPayment),
  transactions: z.array(CardTransaction.extend({ convertible: z.boolean() })),
});
export type CardDetail = z.infer<typeof CardDetail>;

export const UpiPayRequest = z.object({
  payeeVpa: z.string().regex(/^[\w.-]+@[\w]+$/, 'Enter a valid UPI ID'),
  amountPaise: PositivePaise.max(1_00_000_00), // ₹1 lakh UPI cap
  note: z.string().max(50).optional(),
});
export type UpiPayRequest = z.infer<typeof UpiPayRequest>;

export const UpiPayInitResponse = z.object({
  payment: UpiPayment,
  /** Ecosystem UPI PIN page; the app redirects here. */
  pinUrl: z.url(),
});

export const PermissionGrantRequest = z.object({
  scope: PermissionScope,
  context: z.string().max(120),
  /** Must be an explicit, member-made choice; never pre-ticked. */
  explicit: z.literal(true),
});

export const AaConsentStartRequest = z.object({ purpose: AaPurpose });
export const AaConsentStartResponse = z.object({
  consent: AaConsent,
  /** Account Aggregator approval page in the ecosystem app. */
  redirectUrl: z.url(),
});

export const memberEndpoints = {
  personas: endpoint({
    method: 'GET',
    path: '/v1/personas',
    auth: 'none',
    summary: 'Demo personas available for login',
    response: z.object({ personas: z.array(PersonaSummary) }),
  }),
  demoLogin: endpoint({
    method: 'POST',
    path: '/v1/auth/demo-login',
    auth: 'none',
    summary: 'Log in as a demo persona (no real auth)',
    body: z.object({ personaKey: PersonaKey }),
    response: z.object({ token: z.string(), member: Member }),
  }),
  home: endpoint({
    method: 'GET',
    path: '/v1/me/home',
    auth: 'member',
    summary: 'Home screen summary',
    response: HomeSummary,
  }),
  cards: endpoint({
    method: 'GET',
    path: '/v1/cards',
    auth: 'member',
    summary: 'Cards CRED knows about',
    response: z.object({ cards: z.array(Card) }),
  }),
  card: endpoint({
    method: 'GET',
    path: '/v1/cards/:cardId',
    auth: 'member',
    summary: 'Card detail: latest statement, payments, recent transactions',
    params: CardParams,
    response: CardDetail,
  }),
  currentStatement: endpoint({
    method: 'GET',
    path: '/v1/cards/:cardId/statements/current',
    auth: 'member',
    summary: 'Latest statement with transactions',
    params: CardParams,
    response: StatementDetail,
  }),
  statements: endpoint({
    method: 'GET',
    path: '/v1/cards/:cardId/statements',
    auth: 'member',
    summary: 'Statement history',
    params: CardParams,
    response: z.object({ statements: z.array(Statement) }),
  }),
  payBill: endpoint({
    method: 'POST',
    path: '/v1/cards/:cardId/bill-payments',
    auth: 'member',
    summary: 'Pay a card bill. One tap; never blocked by offers.',
    params: CardParams,
    body: BillPayRequest,
    response: BillPayResponse,
  }),
  transactions: endpoint({
    method: 'GET',
    path: '/v1/transactions',
    auth: 'member',
    summary: 'Recent card transactions',
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
    response: z.object({ transactions: z.array(CardTransaction.extend({ convertible: z.boolean() })) }),
  }),
  upiPay: endpoint({
    method: 'POST',
    path: '/v1/upi/payments',
    auth: 'member',
    summary: 'Start a UPI payment through the UPI switch',
    body: UpiPayRequest,
    response: UpiPayInitResponse,
  }),
  upiContacts: endpoint({
    method: 'GET',
    path: '/v1/upi/contacts',
    auth: 'member',
    summary: 'People and shops on UPI (recent payees first)',
    response: z.object({ contacts: z.array(UpiContact) }),
  }),
  upiResolve: endpoint({
    method: 'GET',
    path: '/v1/upi/resolve',
    auth: 'member',
    summary: 'Check a UPI ID and get the registered name',
    query: z.object({ vpa: z.string().min(3).max(60) }),
    response: z.object({ vpa: z.string(), name: z.string().nullable(), valid: z.boolean() }),
  }),
  upiStatus: endpoint({
    method: 'GET',
    path: '/v1/upi/payments/:paymentId',
    auth: 'member',
    summary: 'UPI payment status',
    params: z.object({ paymentId: Id }),
    response: z.object({ payment: UpiPayment }),
  }),
  upiHistory: endpoint({
    method: 'GET',
    path: '/v1/upi/payments',
    auth: 'member',
    summary: 'UPI payments made from CRED',
    response: z.object({ payments: z.array(UpiPayment) }),
  }),
  permissions: endpoint({
    method: 'GET',
    path: '/v1/permissions',
    auth: 'member',
    summary: 'Permissions dashboard',
    response: z.object({ permissions: z.array(Permission) }),
  }),
  grantPermission: endpoint({
    method: 'POST',
    path: '/v1/permissions',
    auth: 'member',
    summary: 'Grant a permission (explicit choice)',
    body: PermissionGrantRequest,
    response: z.object({ permission: Permission }),
  }),
  withdrawPermission: endpoint({
    method: 'DELETE',
    path: '/v1/permissions/:scope',
    auth: 'member',
    summary: 'One-tap withdraw',
    params: z.object({ scope: PermissionScope }),
    response: z.object({ permission: Permission }),
  }),
  startAaConsent: endpoint({
    method: 'POST',
    path: '/v1/aa/consents',
    auth: 'member',
    summary: 'Start an Account Aggregator consent; returns the AA approval page',
    body: AaConsentStartRequest,
    response: AaConsentStartResponse,
  }),
  aaConsents: endpoint({
    method: 'GET',
    path: '/v1/aa/consents',
    auth: 'member',
    summary: 'Account Aggregator consents',
    response: z.object({ consents: z.array(AaConsent) }),
  }),
  revokeAaConsent: endpoint({
    method: 'DELETE',
    path: '/v1/aa/consents/:consentId',
    auth: 'member',
    summary: 'Revoke an Account Aggregator consent',
    params: z.object({ consentId: Id }),
    response: z.object({ consent: AaConsent }),
  }),
  income: endpoint({
    method: 'GET',
    path: '/v1/income',
    auth: 'member',
    summary: 'Verified income, if the member verified it',
    response: z.object({ income: IncomeProfile.nullable() }),
  }),
  creditLadder: endpoint({
    method: 'GET',
    path: '/v1/credit-ladder',
    auth: 'member',
    summary: 'Earned Credit Ladder status (shown, never pushed)',
    response: LadderStatus,
  }),
  rewards: endpoint({
    method: 'GET',
    path: '/v1/rewards',
    auth: 'member',
    summary: 'Coins balance, earn history and redeemable rewards',
    response: z.object({ balance: z.number().int().nonnegative(), history: z.array(RewardEntry), catalog: z.array(RewardItem) }),
  }),
  redeemReward: endpoint({
    method: 'POST',
    path: '/v1/rewards/redeem',
    auth: 'member',
    summary: 'Redeem coins for a reward',
    body: z.object({ rewardId: Id }),
    response: z.object({ balance: z.number().int().nonnegative(), voucherCode: z.string(), reward: RewardItem }),
  }),
  logout: endpoint({
    method: 'POST',
    path: '/v1/auth/logout',
    auth: 'member',
    summary: 'End the demo session',
    response: Ok,
  }),
} as const;

export const SessionClaims = z.object({
  memberId: Id,
  personaKey: PersonaKey,
  issuedAt: IsoDateTime,
});
export type SessionClaims = z.infer<typeof SessionClaims>;
