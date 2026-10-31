import { prng, summariseActivityWeek } from '@cred/db/seed';
import { handlers, notFound } from '@cred/service-kit';
import { ecosystemApi, WearableProvider } from '@cred/types';
import { simDate, type Ctx } from './context';

/**
 * The member's health app (Apple Health / Google Health Connect, mocked).
 * Raw daily steps stay here; an app the member shares with gets one weekly
 * summary (average steps, active days, a score), nothing else.
 */
const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Weeks run Monday to Sunday; 2026-10-05 is a Monday. */
const weekStartOf = (ymd: string) => addDays(ymd, -((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Make sure the health app has a step count for every day up to (not including) today. */
async function fillDays(ctx: Ctx, personId: string, from: string, to: string): Promise<void> {
  const { db } = ctx;
  const b = await db.personaBehaviour.findUnique({ where: { personId } });
  const avg = b?.avgDailySteps ?? 6_000;
  const have = new Set((await db.stepDay.findMany({ where: { personId, date: { gte: from, lt: to } } })).map((d) => d.date));
  const rows: { personId: string; date: string; steps: number }[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (have.has(d)) continue;
    const rand = prng(`steps:${personId}:${d}`);
    rows.push({ personId, date: d, steps: Math.round(avg * (0.6 + rand() * 0.8)) });
  }
  if (rows.length) await db.stepDay.createMany({ data: rows });
}

/** Send weekly summaries for every complete week in [from, to) to the apps the person shares with. */
export async function sendSummaries(ctx: Ctx, personId: string, from: string, to: string): Promise<number> {
  const { db } = ctx;
  const link = await db.wearableLink.findFirst({ where: { personId, sharedWith: 'cred', revokedAt: null } });
  if (!link) return 0;
  await fillDays(ctx, personId, weekStartOf(from), to);
  let n = 0;
  for (let w = weekStartOf(from); addDays(w, 6) < to; w = addDays(w, 7)) {
    const days = await db.stepDay.findMany({ where: { personId, date: { gte: w, lte: addDays(w, 6) } }, orderBy: { date: 'asc' } });
    if (days.length < 7) continue;
    await ctx.outbox.emit('wearable.activity.summary', { customerRef: personId, clientRef: link.clientRef, provider: WearableProvider.parse(link.provider), summary: summariseActivityWeek(w, days) });
    n += 1;
  }
  return n;
}

export function wearableHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  /** The member allowed sharing in their health app: link and send the last four weeks. */
  h.on(ecosystemApi.wearable.link, async ({ body }) => {
    const person = await db.person.findUnique({ where: { phone: body.phone } });
    if (!person) throw notFound('Health app account');
    const existing = await db.wearableLink.findFirst({ where: { personId: person.id } });
    const link = existing
      ? await db.wearableLink.update({ where: { id: existing.id }, data: { provider: body.provider, sharedWith: 'cred', clientRef: body.clientRef, revokedAt: null, linkedAt: new Date() } })
      : await db.wearableLink.create({ data: { personId: person.id, provider: body.provider, sharedWith: 'cred', clientRef: body.clientRef, linkedAt: new Date() } });
    const today = await simDate(db);
    await sendSummaries(ctx, person.id, addDays(weekStartOf(today), -28), today);
    return { linkRef: link.id, customerRef: person.id };
  });

  h.on(ecosystemApi.wearable.unlink, async ({ params }) => {
    const link = await db.wearableLink.findUnique({ where: { id: params.linkRef } });
    if (!link) throw notFound('Link');
    await db.wearableLink.update({ where: { id: link.id }, data: { sharedWith: 'none', revokedAt: new Date() } });
    return { ok: true as const };
  });

  h.on(ecosystemApi.wearable.days, async ({ params }) => {
    const person = await db.person.findUnique({ where: { id: params.customerRef } });
    if (!person) throw notFound('Health app account');
    const link = await db.wearableLink.findFirst({ where: { personId: person.id } });
    const days = await db.stepDay.findMany({ where: { personId: person.id }, orderBy: { date: 'desc' }, take: 28 });
    return {
      provider: link ? WearableProvider.parse(link.provider) : null,
      days: days.map((d) => ({ date: d.date, steps: d.steps })),
      sharedWith: link && link.sharedWith === 'cred' && !link.revokedAt ? [{ app: 'CRED', what: 'One weekly summary: average steps, active days and a 0–100 score' }] : [],
      personName: person.name,
    };
  });
}
