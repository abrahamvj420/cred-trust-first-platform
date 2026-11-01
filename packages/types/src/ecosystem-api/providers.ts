import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, Ok, PositivePaise, ServiceStatus } from '../common';
import { endpoint } from '../contract';
import { EmiInstallment, Vehicle, WaitingPeriod } from '../domain';
import { ClaimStatus, DealerCover, HoldingKind, LoanKind, LoanStatus, PersonaKey, PolicyKind, Relation, Scenario, WearableProvider } from '../enums';

// ── /lender ───────────────────────────────────────────────────────────────────

export const LoanQuote = z.object({
  quoteRef: Id,
  lenderName: z.string(),
  kind: LoanKind,
  principalPaise: PositivePaise,
  tenureMonths: z.number().int().positive(),
  ratePaBps: Bps,
  feeBps: Bps,
  processingFeePaise: NonNegativePaise,
  gstOnFeePaise: NonNegativePaise,
  emiPaise: PositivePaise,
  totalInterestPaise: NonNegativePaise,
  schedule: z.array(EmiInstallment),
  rateStepDown: z.array(z.object({ afterOnTimePayments: z.number().int().positive(), ratePaBps: Bps })).optional(),
});
export type LoanQuote = z.infer<typeof LoanQuote>;

export const lenderEndpoints = {
  quote: endpoint({
    method: 'POST',
    path: '/lender/v1/quotes',
    auth: 'partner',
    summary: 'Indicative quote. Anonymous: no member data is shared until they apply.',
    body: z.object({
      kind: LoanKind,
      principalPaise: PositivePaise,
      tenureMonths: z.number().int().min(3).max(60),
      /** The only thing a quote learns about the applicant: whether their salary is verified (priced 1% lower). */
      incomeVerified: z.boolean().default(false),
      clientRef: Id,
    }),
    response: LoanQuote,
  }),
  apply: endpoint({
    method: 'POST',
    path: '/lender/v1/applications',
    auth: 'partner',
    summary: 'Apply on a quote after the member saw the key facts; lender sends an e-sign OTP',
    body: z.object({
      quoteRef: Id,
      applicant: z.object({ name: z.string(), phone: z.string().regex(/^\d{10}$/) }),
      verifiedMonthlyIncomePaise: PositivePaise.nullable(),
      kfsAcknowledgedAt: IsoDateTime,
      /** Loan against holdings: what is pledged. The lender checks its own loan-to-value limit. */
      collateral: z
        .object({ kind: HoldingKind, ref: z.string(), schemeCode: z.string().nullable(), units: z.number().positive().nullable(), valuePaise: PositivePaise })
        .nullable()
        .default(null),
      clientRef: Id,
    }),
    response: z.object({ applicationRef: Id, status: LoanStatus, otpSentTo: z.string(), demoOtp: z.string() }),
  }),
  esign: endpoint({
    method: 'POST',
    path: '/lender/v1/applications/:applicationRef/otp',
    auth: 'partner',
    summary: 'E-sign the loan agreement with the OTP; decision follows by webhook',
    params: z.object({ applicationRef: Id }),
    body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
    response: z.object({ applicationRef: Id, status: LoanStatus }),
  }),
  prepaymentQuote: endpoint({
    method: 'POST',
    path: '/lender/v1/loans/:loanRef/prepayment-quotes',
    auth: 'partner',
    summary: 'What repaying early would cost and save',
    params: z.object({ loanRef: Id }),
    body: z.object({ amountPaise: PositivePaise.nullable(), full: z.boolean() }),
    response: z.object({
      principalOutstandingPaise: NonNegativePaise,
      amountPaise: PositivePaise,
      chargesPaise: NonNegativePaise,
      chargesNote: z.string(),
      interestSavedPaise: NonNegativePaise,
      remaining: z.array(EmiInstallment),
    }),
  }),
  prepay: endpoint({
    method: 'POST',
    path: '/lender/v1/loans/:loanRef/prepayments',
    auth: 'partner',
    summary: 'Collect an early repayment from the borrower’s bank account; confirmation follows by webhook',
    params: z.object({ loanRef: Id }),
    body: z.object({ amountPaise: PositivePaise.nullable(), full: z.boolean(), clientRef: Id }),
    response: z.object({ prepaymentRef: Id, status: z.literal('received') }),
  }),
  application: endpoint({
    method: 'GET',
    path: '/lender/v1/applications/:applicationRef',
    auth: 'partner',
    summary: 'Application status',
    params: z.object({ applicationRef: Id }),
    response: z.object({ applicationRef: Id, status: LoanStatus, loanRef: Id.nullable() }),
  }),
} as const;

// ── /insurer ──────────────────────────────────────────────────────────────────

export const InsurerProduct = z.enum(['family_floater', 'super_top_up', 'motor_own_damage', 'motor_comprehensive']);

export const InsurerQuote = z.object({
  quoteRef: Id,
  insurerName: z.string(),
  productName: z.string(),
  kind: InsurerProduct,
  coverPaise: PositivePaise,
  deductiblePaise: NonNegativePaise,
  annualPremiumPaise: PositivePaise,
  gstPaise: NonNegativePaise,
  wellnessRewardMaxPct: z.number().min(0).max(100),
  members: z.array(z.object({ relation: Relation, age: z.number().int() })),
  vehicle: Vehicle.nullable(),
  waitingPeriods: z.array(WaitingPeriod),
  freeLookDays: z.number().int().nonnegative(),
});
export type InsurerQuote = z.infer<typeof InsurerQuote>;

const Members = z.array(z.object({ relation: Relation, age: z.number().int().min(0).max(110) })).min(1);

export const InsurerPolicyView = z.object({
  policyRef: Id,
  productName: z.string(),
  kind: PolicyKind,
  coverPaise: PositivePaise,
  annualPremiumPaise: NonNegativePaise,
  isEmployer: z.boolean(),
  employerName: z.string().nullable(),
  membersCovered: z.array(Relation),
  renewalDate: IsoDate.nullable(),
  claims: z.array(z.object({ claimRef: Id, amountPaise: PositivePaise, status: ClaimStatus, filedAt: IsoDateTime })),
});

export const insurerEndpoints = {
  quote: endpoint({
    method: 'POST',
    path: '/insurer/v1/quotes',
    auth: 'partner',
    summary: 'Anonymous quote: ages and relations only (health) or the vehicle (motor)',
    body: z.discriminatedUnion('product', [
      z.object({ product: z.literal('family_floater'), members: Members, coverPaise: PositivePaise, clientRef: Id }),
      z.object({ product: z.literal('super_top_up'), members: Members, coverPaise: PositivePaise, deductiblePaise: PositivePaise, clientRef: Id }),
      z.object({ product: z.enum(['motor_own_damage', 'motor_comprehensive']), vehicle: Vehicle, clientRef: Id }),
    ]),
    response: InsurerQuote,
  }),
  propose: endpoint({
    method: 'POST',
    path: '/insurer/v1/proposals',
    auth: 'partner',
    summary: 'Proposal on a quote, after the member saw the key facts; the insurer sends a confirmation OTP',
    body: z.object({
      /** One proposal can cover several quotes (e.g. a base policy and a top-up): one OTP. */
      quoteRefs: z.array(Id).min(1),
      proposer: z.object({ name: z.string(), phone: z.string().regex(/^\d{10}$/) }),
      insured: z.array(z.object({ name: z.string(), relation: Relation, age: z.number().int() })),
      /** A floater that the new one replaces (e.g. parents added to the family floater); cancelled on issue. */
      replacesPolicyRef: Id.nullable().default(null),
      clientRef: Id,
    }),
    response: z.object({ proposalRef: Id, otpSentTo: z.string(), demoOtp: z.string() }),
  }),
  confirmProposal: endpoint({
    method: 'POST',
    path: '/insurer/v1/proposals/:proposalRef/confirm',
    auth: 'partner',
    summary: 'Confirm with the OTP; premium is collected from the proposer’s bank and the policy is issued (webhook follows)',
    params: z.object({ proposalRef: Id }),
    body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
    response: z.object({ policyRefs: z.array(Id), status: z.literal('issued') }),
  }),
  wellness: endpoint({
    method: 'POST',
    path: '/insurer/v1/policies/:policyRef/wellness',
    auth: 'partner',
    summary: 'The policyholder’s activity score (0–100, nothing else), shared with their consent for the wellness reward',
    params: z.object({ policyRef: Id }),
    body: z.object({ score: z.number().int().min(0).max(100), weeks: z.number().int().min(1).max(8) }),
    response: z.object({ discountPct: z.number().min(0).max(100) }),
  }),
  fileClaim: endpoint({
    method: 'POST',
    path: '/insurer/v1/claims',
    auth: 'partner',
    summary: 'File a claim',
    body: z.object({ policyRef: Id, amountPaise: PositivePaise, description: z.string(), clientRef: Id }),
    response: z.object({ claimRef: Id, status: ClaimStatus }),
  }),
  claim: endpoint({
    method: 'GET',
    path: '/insurer/v1/claims/:claimRef',
    auth: 'partner',
    summary: 'Claim status and timeline',
    params: z.object({ claimRef: Id }),
    response: z.object({
      claimRef: Id,
      status: ClaimStatus,
      timeline: z.array(z.object({ status: ClaimStatus, at: IsoDateTime, note: z.string() })),
    }),
  }),
  customerPolicies: endpoint({
    method: 'GET',
    path: '/insurer/v1/customers/:customerRef/policies',
    auth: 'page',
    summary: 'Insurer portal: policies and claims',
    params: z.object({ customerRef: Id }),
    response: z.object({ insurerName: z.string(), customerName: z.string(), policies: z.array(InsurerPolicyView) }),
  }),
} as const;

// ── /fundhouse ────────────────────────────────────────────────────────────────

export const fundhouseEndpoints = {
  redeem: endpoint({
    method: 'POST',
    path: '/fundhouse/v1/redemptions',
    auth: 'partner',
    summary: 'Redeem units on the investor’s instruction',
    body: z.object({ folio: z.string(), schemeCode: z.string(), amountPaise: PositivePaise, clientRef: Id }),
    response: z.object({ redemptionRef: Id, status: z.enum(['requested', 'completed']) }),
  }),
  portfolio: endpoint({
    method: 'GET',
    path: '/fundhouse/v1/customers/:customerRef/portfolio',
    auth: 'page',
    summary: 'Fund house investor page',
    params: z.object({ customerRef: Id }),
    response: z.object({
      investorName: z.string(),
      holdings: z.array(
        z.object({
          amc: z.string(),
          folio: z.string(),
          schemeCode: z.string(),
          schemeName: z.string(),
          units: z.number(),
          navPaise: PositivePaise,
          valuePaise: NonNegativePaise,
          costPaise: NonNegativePaise,
          lienUnits: z.number().nonnegative(),
        }),
      ),
    }),
  }),
  nav: endpoint({
    method: 'GET',
    path: '/fundhouse/v1/schemes',
    auth: 'none',
    summary: 'Published NAVs (public market data)',
    response: z.object({ asOf: IsoDate, schemes: z.array(z.object({ code: z.string(), name: z.string(), navPaise: PositivePaise })) }),
  }),
} as const;

// ── /wearable ─────────────────────────────────────────────────────────────────

export const wearableEndpoints = {
  link: endpoint({
    method: 'POST',
    path: '/wearable/v1/links',
    auth: 'partner',
    summary: 'Member links their health app to share weekly summaries with CRED',
    body: z.object({ phone: z.string().regex(/^\d{10}$/), provider: WearableProvider, clientRef: Id }),
    response: z.object({ linkRef: Id, customerRef: Id }),
  }),
  unlink: endpoint({
    method: 'DELETE',
    path: '/wearable/v1/links/:linkRef',
    auth: 'partner',
    summary: 'Stop sharing (on permission withdraw)',
    params: z.object({ linkRef: Id }),
    response: Ok,
  }),
  days: endpoint({
    method: 'GET',
    path: '/wearable/v1/people/:customerRef/days',
    auth: 'page',
    summary: 'Raw daily steps (stays in the health app)',
    params: z.object({ customerRef: Id }),
    response: z.object({
      provider: WearableProvider.nullable(),
      days: z.array(z.object({ date: IsoDate, steps: z.number().int().nonnegative() })),
      sharedWith: z.array(z.object({ app: z.string(), what: z.string() })),
      personName: z.string(),
    }),
  }),
} as const;

// ── /sim: demo control (DEMO_MODE only; never called by a real app flow) ─────

export const SimClock = z.object({ date: IsoDate });

export const simEndpoints = {
  clock: endpoint({
    method: 'GET',
    path: '/sim/v1/clock',
    auth: 'demo',
    summary: 'Current simulated date',
    response: SimClock,
  }),
  advance: endpoint({
    method: 'POST',
    path: '/sim/v1/clock/advance',
    auth: 'demo',
    summary: 'Advance time; generates statements and scripted persona behaviour',
    body: z.object({ months: z.number().int().min(1).max(12).default(1) }),
    response: z.object({ from: IsoDate, to: IsoDate, eventsEmitted: z.number().int().nonnegative() }),
  }),
  scenario: endpoint({
    method: 'POST',
    path: '/sim/v1/scenarios',
    auth: 'demo',
    summary: 'Fire a real-world scenario for a persona',
    /** new_vehicle: what the dealer sold with the car. */
    body: z.object({ scenario: Scenario, personaKey: PersonaKey, dealerCover: DealerCover.default('comprehensive') }),
    response: z.object({ scenario: Scenario, personaKey: PersonaKey, eventsEmitted: z.number().int().nonnegative(), note: z.string() }),
  }),
  approveConsents: endpoint({
    method: 'POST',
    path: '/sim/v1/aa/approve',
    auth: 'demo',
    summary: 'Approve a persona’s pending AA requests, sharing every account offered (control room only)',
    body: z.object({ personaKey: PersonaKey }),
    response: z.object({ approved: z.number().int().nonnegative() }),
  }),
  outbox: endpoint({
    method: 'GET',
    path: '/sim/v1/outbox',
    auth: 'demo',
    summary: 'Webhooks not yet delivered (tests and the control room wait for zero)',
    response: z.object({ pending: z.number().int().nonnegative() }),
  }),
  reset: endpoint({
    method: 'POST',
    path: '/sim/v1/reset',
    auth: 'demo',
    summary: 'Reset ecosystem.db to the seed personas',
    response: Ok,
  }),
} as const;

export const ecosystemPlatformEndpoints = {
  status: endpoint({
    method: 'GET',
    path: '/status',
    auth: 'none',
    summary: 'Service health',
    response: ServiceStatus,
  }),
} as const;
