import { createHmac, timingSafeEqual } from 'node:crypto';
import { SessionClaims, StaffSession } from '@cred/types';
import { requireEnv, unauthorized } from '@cred/service-kit';

/** Demo session tokens: base64url(claims).hmac. Not real auth; good enough to scope data per member. */
const sign = (payload: string) => createHmac('sha256', requireEnv('SESSION_SECRET')).update(payload).digest('base64url');

export function issueToken(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): SessionClaims {
  if (!token) throw unauthorized();
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw unauthorized('Malformed session');
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw unauthorized('Invalid session');
  return SessionClaims.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
}

// ── Staff (console) sessions: signed under a different prefix, so a member token can never pass as staff ──
const signStaff = (payload: string) => createHmac('sha256', requireEnv('SESSION_SECRET')).update(`staff.${payload}`).digest('base64url');

export function issueStaffToken(claims: StaffSession): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `stf.${payload}.${signStaff(payload)}`;
}

export function verifyStaffToken(token: string | undefined): StaffSession {
  if (!token?.startsWith('stf.')) throw unauthorized('Sign in to the console');
  const [, payload, sig] = token.split('.');
  if (!payload || !sig) throw unauthorized('Malformed session');
  const expected = Buffer.from(signStaff(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw unauthorized('Invalid session');
  return StaffSession.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
}

export function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
