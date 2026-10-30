import { createHmac, timingSafeEqual } from 'node:crypto';

/** Webhooks older than this are rejected (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return 'v1=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'mismatch' };

export function verifyWebhook(
  secret: string,
  timestamp: string | undefined,
  rawBody: string,
  signature: string | undefined,
  nowMs: number = Date.now(),
): VerifyResult {
  if (!timestamp || !signature) return { ok: false, reason: 'missing' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
