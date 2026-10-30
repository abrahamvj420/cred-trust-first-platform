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
import { DecisionOutcome, FeatureKey, PermissionScope, PersonaKey } from '../enums';
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

const MemberFilter = z.object({
  memberId: Id.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const adminEndpoints = {
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
  stream: endpoint({
    method: 'GET',
    path: '/admin/v1/stream',
    auth: 'admin',
    summary: 'Live admin events (SSE)',
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
  simSwitchPersona: endpoint({
    method: 'POST',
    path: '/sim/persona',
    auth: 'demo',
    summary: 'Tell the member app to switch persona (DEMO_MODE only)',
    body: z.object({ personaKey: PersonaKey }),
    response: Ok,
  }),
} as const;
