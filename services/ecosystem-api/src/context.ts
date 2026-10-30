import type { EcosystemDb } from '@cred/db/ecosystem';
import type { Logger } from '@cred/service-kit';
import type { Outbox } from './outbox';

export interface Ctx {
  db: EcosystemDb;
  outbox: Outbox;
  log: Logger;
  /** Public URL of the ecosystem app (branded OTP / PIN / consent pages). */
  pagesUrl: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export async function simDate(db: EcosystemDb): Promise<string> {
  const c = await db.simClock.findUnique({ where: { id: 1 } });
  if (!c) throw new Error('Simulation clock missing: run pnpm seed');
  return c.currentDate;
}

/** "Now" in the simulated world: the sim date at the current IST time of day. */
export async function simNow(db: EcosystemDb): Promise<Date> {
  const date = await simDate(db);
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return new Date(`${date}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}+05:30`);
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export const maskPhone = (phone: string) => `XXXXXX${phone.slice(-4)}`;
export const demoCode = () => String(Math.floor(100000 + Math.random() * 900000));
