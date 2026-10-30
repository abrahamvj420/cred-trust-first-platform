import { describe, expect, it } from 'vitest';
import { credApi, ecosystemApi, listEndpoints, WebhookEvent } from './index';
import { signWebhook, verifyWebhook } from './webhooks/signing';

describe('contracts', () => {
  for (const [name, tree] of [['cred-api', credApi], ['ecosystem-api', ecosystemApi]] as const) {
    it(`${name}: every method + path is unique`, () => {
      const keys = listEndpoints(tree).map((e) => `${e.method} ${e.path}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`${name}: path params are declared in a params schema`, () => {
      for (const e of listEndpoints(tree)) {
        const names = [...e.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
        if (names.length === 0) continue;
        const shape = (e.params as { shape?: Record<string, unknown> } | undefined)?.shape ?? {};
        for (const n of names) expect(shape, `${e.method} ${e.path}`).toHaveProperty(n!);
      }
    });

    it(`${name}: /sim endpoints are demo-only`, () => {
      for (const e of listEndpoints(tree)) {
        if (e.path.startsWith('/sim')) expect(e.auth, e.path).toBe('demo');
      }
    });
  }

  it('webhook union rejects unknown types', () => {
    const r = WebhookEvent.safeParse({ id: 'e1', type: 'bank.unknown', partner: 'bank', occurredAt: new Date().toISOString(), data: {} });
    expect(r.success).toBe(false);
  });
});

describe('webhook signing', () => {
  const secret = 's3cret';
  const body = JSON.stringify({ hello: 'world' });
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it('accepts a valid signature', () => {
    expect(verifyWebhook(secret, ts, body, signWebhook(secret, ts, body), now)).toEqual({ ok: true });
  });
  it('rejects a tampered body', () => {
    expect(verifyWebhook(secret, ts, body + ' ', signWebhook(secret, ts, body), now)).toEqual({ ok: false, reason: 'mismatch' });
  });
  it('rejects a stale timestamp', () => {
    expect(verifyWebhook(secret, ts, body, signWebhook(secret, ts, body), now + 301_000)).toEqual({ ok: false, reason: 'stale' });
  });
  it('rejects a missing signature', () => {
    expect(verifyWebhook(secret, ts, body, undefined, now)).toEqual({ ok: false, reason: 'missing' });
  });
});
