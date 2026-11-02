import type { CredDb } from '@cred/db/cred';
import { HttpError, unauthorized } from '@cred/service-kit';

/** What a member can reach before the score is checked. Their data rights apply from the moment there's a record. */
const PENDING: RegExp[] = [/^\/v1\/signup\//, /^\/v1\/me\/home$/, /^\/v1\/stream$/, /^\/v1\/privacy\//];

/**
 * Limited membership: UPI and bill pay, and everything the member is owed anyway
 * (their data, privacy, complaints, alerts). Reads of offers and loans stay open
 * so screens load; a Convert to EMI reaches the engine, which logs the decision and says no.
 */
const LIMITED: RegExp[] = [
  ...PENDING,
  /^\/v1\/cards/,
  /^\/v1\/transactions/,
  /^\/v1\/upi\//,
  /^\/v1\/rewards/,
  /^\/v1\/permissions/,
  /^\/v1\/complaints$/,
  /^\/v1\/alerts/,
  /^\/v1\/decisions$/,
  /^\/v1\/auth\//,
];
const LIMITED_READS: RegExp[] = [/^\/v1\/offers$/, /^\/v1\/loans$/, /^\/v1\/aa\/consents$/];

/** Enforced for every member request, so the gate can't be walked around from the app. */
export async function checkMembership(db: CredDb, memberId: string, method: string, route: string): Promise<void> {
  const m = await db.member.findUnique({ where: { id: memberId }, select: { membership: true } });
  if (!m) throw unauthorized('Please sign in again'); // e.g. sign-ups were reset
  if (m.membership === 'full') return;
  if (m.membership === 'pending') {
    if (PENDING.some((r) => r.test(route))) return;
    throw new HttpError(403, 'signup_incomplete', 'Let’s finish checking your eligibility first.');
  }
  if (LIMITED.some((r) => r.test(route)) || (method === 'GET' && LIMITED_READS.some((r) => r.test(route)))) return;
  throw new HttpError(403, 'limited_membership', 'This opens up with full membership. For now, UPI and bill pay are yours to use.');
}
