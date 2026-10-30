import { z } from 'zod';
import { Bps, Id, IsoDate, IsoDateTime, NonNegativePaise, Ok, PositivePaise, ServiceStatus } from '../common';
import { endpoint } from '../contract';
import { EmiInstallment } from '../domain';
import { ClaimStatus, LoanKind, LoanStatus, PersonaKey, PolicyKind, Relation, Scenario, WearableProvider } from '../enums';

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
    summary: 'Quote a loan for a CRED member',
    body: z.object({
      applicant: z.object({ name: z.string(), phone: z.string().regex(/^\d{10}$/) }),
      kind: LoanKind,
      principalPaise: PositivePaise,
      tenureMonths: z.number().int().min(3).max(60),
      verifiedMonthlyIncomePaise: PositivePaise.nullable(),
      clientRef: Id,
    }),
    response: LoanQuote,
  }),
  apply: endpoint({
    method: 'POST',
    path: '/lender/v1/applications',
    auth: 'partner',
    summary: 'Apply on a quote after the member saw the key facts',
    body: z.object({ quoteRef: Id, kfsAcknowledgedAt: IsoDateTime, clientRef: Id }),
    response: z.object({ applicationRef: Id, status: LoanStatus }),
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

export const InsurerQuote = z.object({
  quoteRef: Id,
  insurerName: z.string(),
  productName: z.string(),
  kind: z.enum(['family_floater', 'super_top_up']),
  coverPaise: PositivePaise,
  deductiblePaise: NonNegativePaise,
  annualPremiumPaise: PositivePaise,
  wellnessRewardMaxPct: z.number().min(0).max(100),
  members: z.array(z.object({ relation: Relation, age: z.number().int() })),
});
export type InsurerQuote = z.infer<typeof InsurerQuote>;

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
    summary: 'Quote a family floater or super top-up',
    body: z.object({
      product: z.enum(['family_floater', 'super_top_up']),
      members: z.array(z.object({ relation: Relation, age: z.number().int().min(0).max(110) })).min(1),
      coverPaise: PositivePaise,
      deductiblePaise: NonNegativePaise.default(0),
    }),
    response: InsurerQuote,
  }),
  issue: endpoint({
    method: 'POST',
    path: '/insurer/v1/policies',
    auth: 'partner',
    summary: 'Issue a policy on a quote',
    body: z.object({ quoteRef: Id, proposer: z.object({ name: z.string(), phone: z.string().regex(/^\d{10}$/) }), clientRef: Id }),
    response: z.object({ policyRef: Id, status: z.enum(['issued', 'pending']) }),
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
  lien: endpoint({
    method: 'POST',
    path: '/fundhouse/v1/liens',
    auth: 'partner',
    summary: 'Mark a lien for a loan against funds',
    body: z.object({ folio: z.string(), schemeCode: z.string(), units: z.number().positive(), lenderApplicationRef: Id }),
    response: z.object({ lienRef: Id, status: z.enum(['marked', 'rejected']) }),
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
    body: z.object({ scenario: Scenario, personaKey: PersonaKey }),
    response: z.object({ scenario: Scenario, personaKey: PersonaKey, eventsEmitted: z.number().int().nonnegative(), note: z.string() }),
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
