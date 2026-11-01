import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** The demo console account (credentials are in the README; synthetic, demo only). */
export const DEMO_STAFF = { id: 'stf_ops', email: 'ops@cred.example', name: 'Ananya Rao', password: 'trust-first-demo' } as const;

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const given = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
