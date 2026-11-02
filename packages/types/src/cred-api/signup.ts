import { z } from 'zod';
import { Id, IsoDate, IsoDateTime } from '../common';
import { endpoint } from '../contract';
import { Member } from '../domain';
import { Membership } from '../enums';
import { NOTICE_VERSION, NoticeContent, NoticeLanguage } from '../notice';

/**
 * Sign-up. Order matters: the notice comes before any personal data. Until the
 * member gives a name and email, CRED stores nothing about them: what they've
 * told us so far travels in a short-lived signed token that only their device holds.
 */
export const SignupToken = z.string().startsWith('sgn.');

export const SignupClaims = z.object({
  agreementId: Id,
  phone: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  dob: IsoDate.optional(),
  issuedAt: IsoDateTime,
});
export type SignupClaims = z.infer<typeof SignupClaims>;

export const Phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
const Token = z.object({ signupToken: SignupToken });
const TokenResponse = z.object({ signupToken: SignupToken });

export const CardNetwork = z.enum(['visa', 'mastercard', 'rupay']);

export const SignupStatus = z.object({
  membership: Membership,
  creditScore: z.number().int().nullable(),
  /** The score full membership needs (a rule setting). */
  minScore: z.number().int(),
  bureauName: z.string().nullable(),
  checkedAt: IsoDateTime.nullable(),
  hasCard: z.boolean(),
  tips: z.array(z.object({ title: z.string(), body: z.string() })),
  noticeAgreement: z.object({ version: z.string(), language: NoticeLanguage, agreedAt: IsoDateTime }).nullable(),
});
export type SignupStatus = z.infer<typeof SignupStatus>;

export const signupEndpoints = {
  notice: endpoint({
    method: 'GET',
    path: '/v1/signup/notice',
    auth: 'none',
    summary: 'The privacy notice, in every language it is offered in',
    response: z.object({ version: z.literal(NOTICE_VERSION), languages: z.record(NoticeLanguage, NoticeContent) }),
  }),
  agree: endpoint({
    method: 'POST',
    path: '/v1/signup/agree',
    auth: 'none',
    summary: 'Agree to the notice. Logs version, language and time, with no personal data',
    body: z.object({ noticeVersion: z.literal(NOTICE_VERSION), language: NoticeLanguage, agreed: z.literal(true) }),
    response: TokenResponse,
  }),
  phone: endpoint({
    method: 'POST',
    path: '/v1/signup/phone',
    auth: 'none',
    summary: 'Phone number; a one-time code is sent. Nothing is stored',
    body: Token.extend({ phone: Phone }),
    response: TokenResponse,
  }),
  otp: endpoint({
    method: 'POST',
    path: '/v1/signup/otp',
    auth: 'none',
    summary: 'Confirm the phone with the one-time code (demo: any 6 digits). Nothing is stored',
    body: Token.extend({ otp: z.string().regex(/^\d{6}$/) }),
    response: TokenResponse,
  }),
  dob: endpoint({
    method: 'POST',
    path: '/v1/signup/dob',
    auth: 'none',
    summary: 'Date of birth. Under 18: sign-up stops and the anonymous agreement is removed too, so nothing is kept',
    body: Token.extend({ dob: IsoDate }),
    response: z.discriminatedUnion('outcome', [z.object({ outcome: z.literal('adult'), signupToken: SignupToken }), z.object({ outcome: z.literal('under_18') })]),
  }),
  details: endpoint({
    method: 'POST',
    path: '/v1/signup/details',
    auth: 'none',
    summary: 'Name and email. The member record starts here; returns a session',
    body: Token.extend({ name: z.string().trim().min(2).max(80), email: z.email() }),
    response: z.object({ token: z.string(), member: Member }),
  }),
  creditCheck: endpoint({
    method: 'POST',
    path: '/v1/signup/credit-check',
    auth: 'member',
    summary: 'Check the credit score at the bureau and decide membership (once)',
    response: SignupStatus,
  }),
  status: endpoint({
    method: 'GET',
    path: '/v1/signup/status',
    auth: 'member',
    summary: 'Where this member is: membership, score, card, and the notice they agreed to',
    response: SignupStatus,
  }),
  startCard: endpoint({
    method: 'POST',
    path: '/v1/signup/card',
    auth: 'member',
    summary: 'Start adding a card through the Mock Bank; the member approves on the bank’s page',
    body: z.object({ last4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits'), network: CardNetwork }),
    response: z.object({ redirectUrl: z.url() }),
  }),
} as const;
