import { randomUUID } from 'node:crypto';
import type { EcosystemDb } from '@cred/db/ecosystem';
import { requireEnv } from '@cred/service-kit';
import { WEBHOOK_HEADERS, WebhookEvent, type Partner, type WebhookEventOf, type WebhookEventType } from '@cred/types';
import { signWebhook } from '@cred/types/signing';
import type { Logger } from '@cred/service-kit';

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * Partner webhooks to CRED. Every event is validated against the contract,
 * written to the outbox first, then delivered in order with retries.
 */
export function createOutbox(db: EcosystemDb, log: Logger) {
  let running = false;
  let again = false;

  async function deliver(id: string, payload: string): Promise<void> {
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await fetch(`${requireEnv('CRED_API_URL')}/webhooks/ecosystem`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [WEBHOOK_HEADERS.timestamp]: ts,
        [WEBHOOK_HEADERS.signature]: signWebhook(requireEnv('WEBHOOK_SECRET_ECOSYSTEM'), ts, payload),
        [WEBHOOK_HEADERS.eventId]: id,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`cred-api answered ${res.status}: ${await res.text()}`);
  }

  async function flush(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const due = await db.webhookOutbox.findMany({
          where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        for (const row of due) {
          try {
            await deliver(row.id, row.payloadJson);
            await db.webhookOutbox.update({ where: { id: row.id }, data: { status: 'delivered', attempts: { increment: 1 } } });
          } catch (e) {
            const attempts = row.attempts + 1;
            await db.webhookOutbox.update({
              where: { id: row.id },
              data: {
                attempts,
                lastError: e instanceof Error ? e.message : String(e),
                status: attempts >= 20 ? 'failed' : 'pending',
                nextAttemptAt: new Date(Date.now() + Math.min(30_000, 500 * 2 ** attempts)),
              },
            });
            log.warn({ eventId: row.id, attempts, err: String(e) }, 'webhook delivery failed; will retry');
            break; // keep per-stream order: later events wait for this one
          }
        }
      } while (again);
    } finally {
      running = false;
    }
  }

  setInterval(() => void flush(), 1000).unref();

  return {
    async emit<T extends WebhookEventType>(type: T, data: WebhookEventOf<T>['data']): Promise<WebhookEventOf<T>> {
      const event = WebhookEvent.parse({
        id: `evt_${randomUUID()}`,
        type,
        partner: type.split('.')[0] as Partner,
        occurredAt: new Date().toISOString(),
        data,
      }) as WebhookEventOf<T>;
      await db.webhookOutbox.create({ data: { id: event.id, type, payloadJson: JSON.stringify(event) } });
      void flush();
      return event;
    },
    flush,
  };
}
