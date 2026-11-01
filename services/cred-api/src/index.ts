import { createCredDb } from '@cred/db/cred';
import { resetCred } from '@cred/db/seed';
import { createService, handlers, HttpError, isDemoMode, loadRootEnv, notFound, requireEnv } from '@cred/service-kit';
import { credApi, DEMO_PERSONAS, PersonaKey, WEBHOOK_HEADERS, type Member } from '@cred/types';
import { verifyWebhook } from '@cred/types/signing';
import { adminHandlers } from './admin';
import { creditHandlers } from './credit';
import { loanHandlers } from './loans';
import { privacyHandlers } from './privacy';
import { simHandlers } from './sim';
import { protectHandlers } from './protect';
import { wealthHandlers } from './wealth';
import { createCtx } from './context';
import { Hub } from './hub';
import { memberHandlers } from './member';
import { moneyHandlers } from './money';
import { bearer, issueToken, verifyToken } from './session';
import { ingestWebhook } from './webhooks';
import { loadRules } from './rules';

loadRootEnv();
const db = createCredDb();
const hub = new Hub();

const toMember = (m: { id: string; personaKey: string; name: string; phone: string; city: string; memberSince: string; vpa: string }): Member => ({
  id: m.id,
  personaKey: PersonaKey.parse(m.personaKey),
  name: m.name,
  phoneMasked: `XXXXXX${m.phone.slice(-4)}`,
  city: m.city,
  memberSince: m.memberSince,
  vpa: m.vpa,
});

const svc = createService({
  name: 'cred-api',
  version: '0.1.0',
  checkDb: async () => (await db.$queryRawUnsafe<unknown[]>('SELECT 1')).length === 1,
  simDate: async () => (await db.simState.findUnique({ where: { id: 1 } }))?.currentDate ?? null,
  authenticators: {
    member: (req) => {
      const q = req.query as { token?: string };
      return verifyToken(bearer(req.headers.authorization) ?? q.token);
    },
    // Internal console: open on localhost for the demo.
    admin: () => ({ actor: 'admin' as const }),
    webhook: (req) => {
      const header = (h: string) => req.headers[h] as string | undefined;
      const result = verifyWebhook(requireEnv('WEBHOOK_SECRET_ECOSYSTEM'), header(WEBHOOK_HEADERS.timestamp), req.rawBody ?? '', header(WEBHOOK_HEADERS.signature));
      if (!result.ok) {
        const eventId = header(WEBHOOK_HEADERS.eventId) ?? 'unknown';
        hub.admin({ type: 'webhook.received', data: { eventId, type: 'unverified', signatureOk: false, duplicate: false } });
        void db.auditLog.create({ data: { memberId: null, actor: 'system', action: 'webhook.rejected', target: eventId, detailsJson: JSON.stringify({ reason: result.reason }) } });
        throw new HttpError(401, 'bad_signature', `Webhook signature ${result.reason}`);
      }
      return { partner: 'ecosystem' as const };
    },
  },
});

const ctx = createCtx(db, hub, svc.app.log);
await loadRules(db);

const h = handlers()
  .on(credApi.platform.status, () => svc.status())
  .on(credApi.member.personas, async () => ({
    personas: DEMO_PERSONAS.map((p) => ({ key: p.key, name: p.name, city: p.city, tagline: p.tagline })),
  }))
  .on(credApi.member.demoLogin, async ({ body }) => {
    const m = await db.member.findUnique({ where: { personaKey: body.personaKey } });
    if (!m || m.deletedAt) throw notFound('Member');
    const member = toMember(m);
    await db.auditLog.create({ data: { memberId: m.id, actor: 'member', action: 'session.started', target: 'demo-login' } });
    return { token: issueToken({ memberId: m.id, personaKey: member.personaKey, issuedAt: new Date().toISOString() }), member };
  })
  .on(credApi.platform.webhook, ({ body }) => ingestWebhook(ctx, body))
  .on(credApi.platform.simSwitchPersona, async ({ body }) => {
    const m = await db.member.findMany();
    for (const x of m) hub.member(x.id, { type: 'demo.persona_switched', data: { personaKey: body.personaKey } });
    return { ok: true as const };
  })
  .on(credApi.platform.simReset, async () => {
    await resetCred(db);
    await loadRules(db);
    return { ok: true as const };
  });

memberHandlers(ctx, h);
moneyHandlers(ctx, h);
adminHandlers(ctx, h);
creditHandlers(ctx, h);
wealthHandlers(ctx, h);
protectHandlers(ctx, h);
loanHandlers(ctx, h);
privacyHandlers(ctx, h);
simHandlers(ctx, h);

svc.implement(credApi, h.map);

await svc.listen();
svc.app.log.info(`cred-api ready · DEMO_MODE=${isDemoMode()}`);
