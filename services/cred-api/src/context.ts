import type { CredDb } from '@cred/db/cred';
import { requireEnv, type Logger } from '@cred/service-kit';
import { call, type CallInput, type Endpoint, type EndpointResponse, type AuditEntry } from '@cred/types';
import type { Hub } from './hub';
import { toAudit } from './mappers';

export interface Ctx {
  db: CredDb;
  hub: Hub;
  log: Logger;
  /** Call an ecosystem partner as CRED (partner key attached). */
  partner<E extends Endpoint>(endpoint: E, input?: CallInput<E>): Promise<EndpointResponse<E>>;
  audit(entry: { memberId: string | null; actor: AuditEntry['actor']; action: string; target?: string | null; details?: Record<string, unknown> }): Promise<void>;
  simDate(): Promise<string>;
}

export function createCtx(db: CredDb, hub: Hub, log: Logger): Ctx {
  return {
    db,
    hub,
    log,
    partner: (endpoint, input = {}) =>
      call(requireEnv('ECOSYSTEM_API_URL'), endpoint, { ...input, headers: { ...input.headers, 'x-partner-key': requireEnv('PARTNER_API_KEY_CRED') } }),
    async audit({ memberId, actor, action, target = null, details = {} }) {
      const row = await db.auditLog.create({ data: { memberId, actor, action, target, detailsJson: JSON.stringify(details) } });
      hub.admin({ type: 'audit.logged', data: { entry: toAudit(row) } });
    },
    async simDate() {
      return (await db.simState.findUnique({ where: { id: 1 } }))?.currentDate ?? new Date().toISOString().slice(0, 10);
    },
  };
}
