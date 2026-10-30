import { createEcosystemDb } from '@cred/db/ecosystem';
import { resetEcosystem } from '@cred/db/seed';
import { createService, handlers, HttpError, isDemoMode, loadRootEnv, requireEnv } from '@cred/service-kit';
import { ecosystemApi } from '@cred/types';
import { lenderHandlers } from './lender';
import { createOutbox } from './outbox';
import { ecosystemPagesUrl, railsHandlers } from './rails';

loadRootEnv();
const db = createEcosystemDb();

const svc = createService({
  name: 'ecosystem-api',
  version: '0.1.0',
  checkDb: async () => (await db.$queryRawUnsafe<unknown[]>('SELECT 1')).length === 1,
  simDate: async () => (await db.simClock.findUnique({ where: { id: 1 } }))?.currentDate ?? null,
  authenticators: {
    // CRED calling as a partner (FIU, payment app, distributor)
    partner: (req) => {
      if (req.headers['x-partner-key'] !== requireEnv('PARTNER_API_KEY_CRED')) {
        throw new HttpError(401, 'bad_partner_key', 'Unknown partner');
      }
      return { partner: 'cred' as const };
    },
    // ShopKart calling the gateway
    merchant: async (req) => {
      const key = req.headers['x-merchant-key'];
      const merchant = typeof key === 'string' ? await db.merchant.findUnique({ where: { apiKey: key } }) : null;
      if (!merchant) throw new HttpError(401, 'bad_merchant_key', 'Unknown merchant');
      return { merchantId: merchant.id };
    },
    // Branded ecosystem pages acting for the person in front of them (OTP, PIN, consent)
    page: () => ({}),
  },
});

const outbox = createOutbox(db, svc.app.log);
const ctx = { db, outbox, log: svc.app.log, pagesUrl: ecosystemPagesUrl() };

const h = handlers()
  .on(ecosystemApi.platform.status, () => svc.status())
  .on(ecosystemApi.sim.clock, async () => {
    const c = await db.simClock.findUnique({ where: { id: 1 } });
    if (!c) throw new HttpError(503, 'not_seeded', 'Run pnpm seed');
    return { date: c.currentDate };
  })
  .on(ecosystemApi.sim.reset, async () => {
    await resetEcosystem(db);
    await db.webhookOutbox.deleteMany();
    return { ok: true as const };
  });

railsHandlers(ctx, h);
lenderHandlers(ctx, h);

svc.implement(ecosystemApi, h.map);

await svc.listen();
svc.app.log.info(`ecosystem-api ready · DEMO_MODE=${isDemoMode()}`);
