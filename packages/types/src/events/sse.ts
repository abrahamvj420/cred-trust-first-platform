import { z } from 'zod';
import { Id, IsoDateTime } from '../common';
import { AuditEntry, CardTransaction, Claim, EngineDecision, HelpPlan, Loan, MemberAlert, Offer, Permission } from '../domain';
import { PermissionScope, PersonaKey } from '../enums';

/** Pushed from cred-api to the member app over server-sent events. */
const ev = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ id: Id, type: z.literal(type), at: IsoDateTime, data });

export const MemberStreamEvent = z.discriminatedUnion('type', [
  ev('transaction.posted', z.object({ transaction: CardTransaction })),
  ev('offer.created', z.object({ offer: Offer })),
  ev('offer.updated', z.object({ offer: Offer })),
  /** First proactive offer: ask once for Smart Savings at the moment of value. */
  ev(
    'permission.prompt',
    z.object({ scope: PermissionScope, context: z.string(), previewBenefitPaise: z.number().int().positive() }),
  ),
  ev('permission.changed', z.object({ permission: Permission })),
  ev('help.created', z.object({ help: HelpPlan })),
  ev('loan.updated', z.object({ loan: Loan })),
  ev('claim.updated', z.object({ claim: Claim })),
  ev('upi.updated', z.object({ paymentId: Id, status: z.string() })),
  ev('alert.created', z.object({ alert: MemberAlert })),
  /** Something the member's screens show changed (statement, ladder, income, holdings, cover, wellness, consent). */
  ev('data.updated', z.object({ area: z.enum(['cards', 'ladder', 'income', 'holdings', 'insurance', 'wellness', 'consent', 'goals', 'complaints', 'loans']) })),
  ev('demo.persona_switched', z.object({ personaKey: PersonaKey })),
  ev('heartbeat', z.object({})),
]);
export type MemberStreamEvent = z.infer<typeof MemberStreamEvent>;

/** Pushed from cred-api to the admin console. */
export const AdminStreamEvent = z.discriminatedUnion('type', [
  ev('transaction.posted', z.object({ memberId: Id, transaction: CardTransaction })),
  ev('decision.recorded', z.object({ decision: EngineDecision })),
  ev('offer.updated', z.object({ memberId: Id, offer: Offer })),
  ev('audit.logged', z.object({ entry: AuditEntry })),
  ev('webhook.received', z.object({ eventId: Id, type: z.string(), signatureOk: z.boolean(), duplicate: z.boolean() })),
  ev('sim.advanced', z.object({ from: z.string(), to: z.string() })),
  ev('heartbeat', z.object({})),
]);
export type AdminStreamEvent = z.infer<typeof AdminStreamEvent>;
