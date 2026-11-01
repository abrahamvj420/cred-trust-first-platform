import { z } from 'zod';
import { Id, IsoDateTime, Ok, ServiceStatus } from '../common';
import { endpoint } from '../contract';
import {
  AaConsent,
  AuditEntry,
  CardTransaction,
  EngineDecision,
  Holding,
  IncomeProfile,
  InsurancePolicy,
  Loan,
  Member,
  Offer,
  Permission,
  ActivitySummary,
} from '../domain';
import { MemberStreamEvent, AdminStreamEvent } from '../events/sse';
import { DecisionOutcome, FeatureKey, MemberAction, PermissionScope, PersonaKey, ReasonCode } from '../enums';
import { Complaint } from '../domain';
import { WebhookAck, WebhookEvent } from '../webhooks/events';

// ── Privacy ───────────────────────────────────────────────────────────────────

export const WhatCredKnows = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      /** Which permission let CRED hold this; null = needed to run your account. */
      permission: PermissionScope.nullable(),
      items: z.array(z.object({ label: z.string(), value: z.string() })),
    }),
  ),
  neverHeld: z.array(z.string()),
});
export type WhatCredKnows = z.infer<typeof WhatCredKnows>;

export const DataExport = z.object({
  generatedAt: IsoDateTime,
  member: Member,
  permissions: z.array(Permission),
  consents: z.array(AaConsent),
  transactions: z.array(CardTransaction),
  offers: z.array(Offer),
  decisions: z.array(EngineDecision),
  loans: z.array(Loan),
  holdings: z.array(Holding),
  policies: z.array(InsurancePolicy),
  income: IncomeProfile.nullable(),
  activity: z.array(ActivitySummary),
  audit: z.array(AuditEntry),
});
export type DataExport = z.infer<typeof DataExport>;

export const privacyEndpoints = {
  whatCredKnows: endpoint({
    method: 'GET',
    path: '/v1/privacy/what-cred-knows',
    auth: 'member',
    summary: '"What CRED knows about me"',
    response: WhatCredKnows,
  }),
  exportData: endpoint({
    method: 'GET',
    path: '/v1/privacy/export',
    auth: 'member',
    summary: 'Download my data',
    response: DataExport,
  }),
  deleteData: endpoint({
    method: 'POST',
    path: '/v1/privacy/delete',
    auth: 'member',
    summary: 'Delete my data (typed confirmation)',
    body: z.object({ confirm: z.literal('DELETE') }),
    response: z.object({ deleted: z.literal(true), retainedForLaw: z.array(z.string()) }),
  }),
} as const;

// ── Admin console ─────────────────────────────────────────────────────────────

const AdminMemberRow = Member.extend({
  smartSavings: z.boolean(),
  stressed: z.boolean(),
  offersThisMonth: z.number().int().nonnegative(),
  activeOfferId: Id.nullable(),
});

export const RuleSetting = z.object({
  key: z.string(),
  group: z.string(),
  label: z.string(),
  unit: z.enum(['bps', 'paise', 'days', 'count', 'months', 'multiple_bps']),
  value: z.number(),
  display: z.string(),
  description: z.string(),
});
export type RuleSetting = z.infer<typeof RuleSetting>;

export const RuleSettingWithBounds = RuleSetting.extend({ min: z.number(), max: z.number(), changed: z.boolean(), defaultValue: z.number() });

export const FunnelRow = z.object({
  feature: FeatureKey,
  decisions: z.number().int(),
  offers: z.number().int(),
  awaitingPermission: z.number().int(),
  shown: z.number().int(),
  accepted: z.number().int(),
  /** Accepted offers whose loan now has a bounced EMI. */
  acceptedNowOverdue: z.number().int(),
  dismissed: z.number().int(),
  expired: z.number().int(),
  help: z.number().int(),
  available: z.number().int(),
  blocked: z.array(z.object({ reason: ReasonCode, count: z.number().int() })),
});

export const AdminOverview = z.object({
  simDate: z.string(),
  members: z.number().int(),
  kpis: z.object({
    decisions: z.number().int(),
    offersShown: z.number().int(),
    accepted: z.number().int(),
    acceptanceRateBps: z.number().int(),
    blocked: z.number().int(),
    help: z.number().int(),
    memberGainsPaise: z.number().int(),
    openComplaints: z.number().int(),
  }),
  funnel: z.array(FunnelRow),
  gains: z.array(z.object({ source: z.string(), count: z.number().int(), gainPaise: z.number().int() })),
  defaults: z.object({
    activeLoans: z.number().int(),
    loansWithOverdue: z.number().int(),
    overdueInstalments: z.number().int(),
    overduePaise: z.number().int(),
    loansOver90Days: z.number().int(),
    defaultRateBps: z.number().int(),
    cardBillsMissed: z.number().int(),
    bouncesThisMonth: z.number().int(),
    membersOnRepaymentPlans: z.number().int(),
    membersShowingStrain: z.number().int(),
  }),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

export const LadderTierSetting = z.object({
  tier: z.string(),
  requiredOnTimeMonths: z.number().int(),
  limitPaise: z.number().int(),
  ratePaBps: z.number().int(),
});

const MemberFilter = z.object({
  memberId: Id.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const StaffSession = z.object({ staffId: Id, name: z.string(), email: z.string(), issuedAt: IsoDateTime });
export type StaffSession = z.infer<typeof StaffSession>;

export const adminEndpoints = {
  login: endpoint({
    method: 'POST',
    path: '/admin/v1/login',
    auth: 'none',
    summary: 'Staff sign-in to the console (demo account; separate from member sessions)',
    body: z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) }),
    response: z.object({ token: z.string(), staff: z.object({ name: z.string(), email: z.string() }) }),
  }),
  me: endpoint({
    method: 'GET',
    path: '/admin/v1/me',
    auth: 'admin',
    summary: 'The signed-in staff member',
    response: z.object({ name: z.string(), email: z.string() }),
  }),
  members: endpoint({
    method: 'GET',
    path: '/admin/v1/members',
    auth: 'admin',
    summary: 'All members with risk and offer flags',
    response: z.object({ members: z.array(AdminMemberRow) }),
  }),
  transactions: endpoint({
    method: 'GET',
    path: '/admin/v1/transactions',
    auth: 'admin',
    summary: 'Ingested transaction feed',
    query: MemberFilter,
    response: z.object({ transactions: z.array(CardTransaction.extend({ memberId: Id, memberName: z.string() })) }),
  }),
  decisions: endpoint({
    method: 'GET',
    path: '/admin/v1/decisions',
    auth: 'admin',
    summary: 'Engine decisions including blocked offers and reasons',
    query: MemberFilter.extend({ outcome: DecisionOutcome.optional(), feature: FeatureKey.optional() }),
    response: z.object({ decisions: z.array(EngineDecision.extend({ memberName: z.string() })) }),
  }),
  permissionLog: endpoint({
    method: 'GET',
    path: '/admin/v1/permissions',
    auth: 'admin',
    summary: 'Permission grant/withdraw log',
    query: MemberFilter,
    response: z.object({ entries: z.array(AuditEntry) }),
  }),
  audit: endpoint({
    method: 'GET',
    path: '/admin/v1/audit',
    auth: 'admin',
    summary: 'Full audit log, including privacy actions',
    query: MemberFilter,
    response: z.object({ entries: z.array(AuditEntry) }),
  }),
  loans: endpoint({
    method: 'GET',
    path: '/admin/v1/loans',
    auth: 'admin',
    summary: 'Loans booked through CRED',
    query: MemberFilter,
    response: z.object({ loans: z.array(Loan.extend({ memberId: Id, memberName: z.string() })) }),
  }),
  webhooks: endpoint({
    method: 'GET',
    path: '/admin/v1/webhooks',
    auth: 'admin',
    summary: 'Inbound webhook log with signature results',
    query: MemberFilter,
    response: z.object({
      webhooks: z.array(
        z.object({ eventId: Id, type: z.string(), partner: z.string(), signatureOk: z.boolean(), duplicate: z.boolean(), receivedAt: IsoDateTime }),
      ),
    }),
  }),
  rules: endpoint({
    method: 'GET',
    path: '/admin/v1/rules',
    auth: 'admin',
    summary: 'Engine rule settings in force, with their allowed range',
    response: z.object({ rules: z.array(RuleSettingWithBounds), ladder: z.array(LadderTierSetting), editable: z.boolean() }),
  }),
  updateRule: endpoint({
    method: 'PATCH',
    path: '/admin/v1/rules/:key',
    auth: 'admin',
    summary: 'Change a rule live (validated; logged with who, from and to)',
    params: z.object({ key: z.string() }),
    body: z.object({ value: z.number().int(), reason: z.string().trim().min(3).max(200) }),
    response: z.object({ rule: RuleSettingWithBounds }),
  }),
  resetRules: endpoint({
    method: 'POST',
    path: '/admin/v1/rules/reset',
    auth: 'admin',
    summary: 'Put every rule back to its default (logged)',
    body: z.object({ reason: z.string().trim().min(3).max(200) }),
    response: Ok,
  }),
  overview: endpoint({
    method: 'GET',
    path: '/admin/v1/overview',
    auth: 'admin',
    summary: 'Offer funnel by feature, member gains, defaults, complaints',
    response: AdminOverview,
  }),
  complaints: endpoint({
    method: 'GET',
    path: '/admin/v1/complaints',
    auth: 'admin',
    summary: 'Member complaints',
    query: MemberFilter,
    response: z.object({ complaints: z.array(Complaint.extend({ memberId: Id, memberName: z.string() })) }),
  }),
  resolveComplaint: endpoint({
    method: 'POST',
    path: '/admin/v1/complaints/:complaintId/resolve',
    auth: 'admin',
    summary: 'Resolve a complaint with a note to the member (logged)',
    params: z.object({ complaintId: Id }),
    body: z.object({ resolution: z.string().trim().min(5).max(600) }),
    response: z.object({ complaint: Complaint }),
  }),
  partnerCalls: endpoint({
    method: 'GET',
    path: '/admin/v1/partner-calls',
    auth: 'admin',
    summary: 'Calls CRED made to partners (lender, insurer, AA, bank …)',
    query: MemberFilter,
    response: z.object({
      calls: z.array(z.object({ id: Id, partner: z.string(), method: z.string(), path: z.string(), status: z.number().int(), ms: z.number().int(), memberId: Id.nullable(), at: IsoDateTime })),
    }),
  }),
  stream: endpoint({
    method: 'GET',
    path: '/admin/v1/stream',
    auth: 'admin',
    summary: 'Live admin events (SSE; staff token as ?token= because EventSource cannot set headers)',
    query: z.object({ token: z.string() }),
    stream: true,
    response: AdminStreamEvent,
  }),
} as const;

// ── Platform: status, inbound webhooks, member stream, demo-only sim ─────────

export const platformEndpoints = {
  status: endpoint({
    method: 'GET',
    path: '/status',
    auth: 'none',
    summary: 'Service health',
    response: ServiceStatus,
  }),
  webhook: endpoint({
    method: 'POST',
    path: '/webhooks/ecosystem',
    auth: 'webhook',
    summary: 'Signed partner events from the ecosystem',
    body: WebhookEvent,
    response: WebhookAck,
  }),
  memberStream: endpoint({
    method: 'GET',
    path: '/v1/stream',
    auth: 'member',
    summary: 'Live member events (SSE; token passed as ?token= because EventSource cannot set headers)',
    query: z.object({ token: z.string() }),
    stream: true,
    response: MemberStreamEvent,
  }),
  simReset: endpoint({
    method: 'POST',
    path: '/sim/reset',
    auth: 'demo',
    summary: 'Reset cred.db to the seed personas (DEMO_MODE only)',
    response: Ok,
  }),
  simMemberAction: endpoint({
    method: 'POST',
    path: '/sim/member-actions',
    auth: 'demo',
    summary: 'Do something in the app on a persona’s behalf (control room; DEMO_MODE only)',
    body: z.object({ action: MemberAction, personaKey: PersonaKey }),
    response: z.object({ action: MemberAction, personaKey: PersonaKey, note: z.string() }),
  }),
  simSwitchPersona: endpoint({
    method: 'POST',
    path: '/sim/persona',
    auth: 'demo',
    summary: 'Tell the member app to switch persona (DEMO_MODE only)',
    body: z.object({ personaKey: PersonaKey }),
    response: Ok,
  }),
} as const;
