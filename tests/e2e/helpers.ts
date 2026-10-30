import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  call,
  credApi,
  ecosystemApi,
  personaByKey,
  WEBHOOK_HEADERS,
  type CallInput,
  type Endpoint,
  type EndpointResponse,
  type PersonaKey,
} from '@cred/types';
import { signWebhook } from '@cred/types/signing';
import { E2E } from './setup';

const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`e2e needs ${k} in .env`);
  return v;
};

export const cred = <E extends Endpoint>(e: E, input: CallInput<E> & { token?: string } = {}): Promise<EndpointResponse<E>> =>
  call(E2E.credApi, e, { ...input, headers: { ...input.headers, ...(input.token ? { authorization: `Bearer ${input.token}` } : {}) } });

export const eco = <E extends Endpoint>(e: E, input: CallInput<E> & { as?: 'merchant' | 'partner' | 'page' } = {}): Promise<EndpointResponse<E>> =>
  call(E2E.ecosystemApi, e, {
    ...input,
    headers: {
      ...input.headers,
      ...(input.as === 'merchant' ? { 'x-merchant-key': env('SHOPKART_MERCHANT_KEY') } : {}),
      ...(input.as === 'partner' ? { 'x-partner-key': env('PARTNER_API_KEY_CRED') } : {}),
    },
  });

export async function resetWorld(): Promise<void> {
  await eco(ecosystemApi.sim.reset);
  await cred(credApi.platform.simReset);
}

export async function login(key: PersonaKey): Promise<string> {
  return (await cred(credApi.member.demoLogin, { body: { personaKey: key } })).token;
}

/** Poll until fn returns a truthy value. */
export async function eventually<T>(fn: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${String(last)}` : ''}`);
}

/**
 * ShopKart checkout as a shopper: gateway → Mock Bank OTP → approved.
 * Returns the gateway payment id once the bank approved.
 */
export async function buyOnShopKart(key: PersonaKey, amountPaise: number, item = 'Aero 14 Laptop'): Promise<string> {
  const phone = personaByKey(key).phone;
  const { cards } = await eco(ecosystemApi.gateway.savedCards, { as: 'merchant', params: { shopperPhone: phone } });
  const created = await eco(ecosystemApi.gateway.createPayment, {
    as: 'merchant',
    body: {
      orderId: `SK-${key}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      amountPaise,
      description: item,
      shopperPhone: phone,
      returnUrl: 'http://localhost:3002/order/test',
      instrument: { method: 'card', cardToken: cards[0]!.token },
    },
  });
  if (!created.nextAction) throw new Error(`Payment not authorisable: ${created.payment.failureReason}`);
  const authId = created.nextAction.url.split('/').at(-1)!;
  const challenge = await eco(ecosystemApi.bank.cardAuth, { params: { authId } });
  const result = await eco(ecosystemApi.bank.submitOtp, { params: { authId }, body: { otp: '123456' } });
  if (result.status !== 'approved') throw new Error(`OTP not approved: ${result.status}`);
  if (challenge.amountPaise !== amountPaise) throw new Error('OTP page shows the wrong amount');
  return created.payment.paymentId;
}

/** Sign a webhook as Mock Bank would. */
export function signedPost(body: unknown, opts: { forge?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = opts.forge ? 'v1=' + '0'.repeat(64) : signWebhook(env('WEBHOOK_SECRET_ECOSYSTEM'), ts, raw);
  return fetch(`${E2E.credApi}/webhooks/ecosystem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [WEBHOOK_HEADERS.timestamp]: ts, [WEBHOOK_HEADERS.signature]: signature },
    body: raw,
  });
}

/** Collects member SSE events in the background. */
export function openStream(token: string) {
  const events: { type: string; data: unknown }[] = [];
  const ctrl = new AbortController();
  void (async () => {
    try {
      const res = await fetch(`${E2E.credApi}/v1/stream?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch {}
  })();
  return { events, close: () => ctrl.abort(), waitFor: (type: string) => eventually(async () => events.find((e) => e.type === type), `SSE ${type}`) };
}
