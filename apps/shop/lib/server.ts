import 'server-only';
import { call, DEMO_PERSONAS, type CallInput, type Endpoint, type EndpointResponse, type PersonaKey } from '@cred/types';
import { cookies } from 'next/headers';

/** ShopKart's server talks to its payment gateway with its merchant key; the key never reaches the browser. */
export function gateway<E extends Endpoint>(endpoint: E, input: CallInput<E> = {}): Promise<EndpointResponse<E>> {
  const key = process.env.SHOPKART_MERCHANT_KEY;
  if (!key) throw new Error('SHOPKART_MERCHANT_KEY missing from .env');
  return call(process.env.ECOSYSTEM_API_URL ?? 'http://localhost:4100', endpoint, { ...input, headers: { ...input.headers, 'x-merchant-key': key } });
}

export const SHOPPER_COOKIE = 'sk_shopper';

export async function currentShopper() {
  const key = (await cookies()).get(SHOPPER_COOKIE)?.value as PersonaKey | undefined;
  return DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}
