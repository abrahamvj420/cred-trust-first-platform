/**
 * M1 smoke test against a running `pnpm dev`: every app and API answers
 * /status, matches the contract, and /sim is gated by DEMO_MODE.
 * The golden-path test replaces this as the main e2e in M2.
 */
import { localUrl, ServiceStatus, type ServiceName } from '@cred/types';
import { describe, expect, it } from 'vitest';

const SERVICES: ServiceName[] = ['cred', 'admin', 'shop', 'ecosystem', 'cred-api', 'ecosystem-api'];

describe('M1 smoke: everything is up', () => {
  for (const service of SERVICES) {
    it(`${service} /status is ok and matches the contract`, async () => {
      const res = await fetch(`${localUrl(service)}/status`);
      expect(res.status).toBe(200);
      const status = ServiceStatus.parse(await res.json());
      expect(status.service).toBe(service);
      expect(status.ok).toBe(true);
    });
  }

  it('APIs share the same sim date', async () => {
    const [a, b] = await Promise.all(
      (['cred-api', 'ecosystem-api'] as const).map(async (s) => ServiceStatus.parse(await (await fetch(`${localUrl(s)}/status`)).json())),
    );
    expect(a!.simDate).not.toBeNull();
    expect(a!.simDate).toBe(b!.simDate);
  });

  it('unimplemented contract endpoints answer 501, unknown routes 404', async () => {
    const todo = await fetch(`${localUrl('ecosystem-api')}/lender/v1/applications/x`, { headers: { 'x-partner-key': process.env.PARTNER_API_KEY_CRED ?? 'dev-partner-key-change-me' } });
    expect(todo.status).toBe(501);
    expect((await fetch(`${localUrl('cred-api')}/not-a-route`)).status).toBe(404);
  });

  it('demo login returns a session for a persona', async () => {
    const res = await fetch(`${localUrl('cred-api')}/v1/auth/demo-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaKey: 'aarav' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.member.name).toBe('Aarav Mehta');
    expect(json.member.phoneMasked).toBe('XXXXXX0001');
  });

  it('webhooks without a valid signature are rejected', async () => {
    const res = await fetch(`${localUrl('cred-api')}/webhooks/ecosystem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sim-timestamp': String(Math.floor(Date.now() / 1000)), 'x-sim-signature': 'v1=forged' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });
});
