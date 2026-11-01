import type { CredDb } from '@cred/db/cred';
import { requireEnv, type Logger } from '@cred/service-kit';
import { ApiError, call, type CallInput, type Endpoint, type EndpointResponse, type AuditEntry } from '@cred/types';
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
  /** "Now" in the simulated world: sim date at the current IST time of day. */
  simNow(): Promise<Date>;
}

export function createCtx(db: CredDb, hub: Hub, log: Logger): Ctx {
  return {
    db,
    hub,
    log,
    async partner(endpoint, input = {}) {
      // Every partner call is logged for the admin partner log
      const started = Date.now();
      let status = 200;
      try {
        return await call(requireEnv('ECOSYSTEM_API_URL'), endpoint, { ...input, headers: { ...input.headers, 'x-partner-key': requireEnv('PARTNER_API_KEY_CRED') } });
      } catch (e) {
        status = e instanceof ApiError ? e.status : 503;
        throw e;
      } finally {
        void db.partnerCall
          .create({ data: { partner: endpoint.path.split('/')[1] ?? 'unknown', method: endpoint.method, path: endpoint.path, status, ms: Date.now() - started } })
          .catch(() => undefined);
      }
    },
    async audit({ memberId, actor, action, target = null, details = {} }) {
      const row = await db.auditLog.create({ data: { memberId, actor, action, target, detailsJson: JSON.stringify(details) } });
      hub.admin({ type: 'audit.logged', data: { entry: toAudit(row) } });
    },
    async simDate() {
      return (await db.simState.findUnique({ where: { id: 1 } }))?.currentDate ?? new Date().toISOString().slice(0, 10);
    },
    async simNow() {
      const date = await this.simDate();
      const ist = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(11, 19);
      return new Date(`${date}T${ist}+05:30`);
    },
  };
}
