import 'server-only';
import { call, DEMO_PERSONAS, type CallInput, type Endpoint, type EndpointResponse, type PersonaKey } from '@cred/types';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { productBySlug, type Product } from './catalog';

/** ShopKart's server talks to its payment gateway with its merchant key; the key never reaches the browser. */
export function gateway<E extends Endpoint>(endpoint: E, input: CallInput<E> = {}): Promise<EndpointResponse<E>> {
  const key = process.env.SHOPKART_MERCHANT_KEY;
  if (!key) throw new Error('SHOPKART_MERCHANT_KEY missing from .env');
  return call(process.env.ECOSYSTEM_API_URL ?? 'http://localhost:4100', endpoint, { ...input, headers: { ...input.headers, 'x-merchant-key': key } });
}

export const SHOPPER_COOKIE = 'sk_shopper';
export const CART_COOKIE = 'sk_cart';
export const orderCookie = (orderId: string) => `sk_order_${orderId}`;

export async function currentShopper() {
  const key = (await cookies()).get(SHOPPER_COOKIE)?.value as PersonaKey | undefined;
  return DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}

const CartLines = z.array(z.object({ slug: z.string(), qty: z.number().int().min(1).max(9) }));
export type CartLine = { product: Product; qty: number };

export function parseLines(raw: string | undefined): { slug: string; qty: number }[] {
  try {
    return CartLines.parse(JSON.parse(raw ?? '[]'));
  } catch {
    return [];
  }
}

export async function readCart(): Promise<{ lines: CartLine[]; totalPaise: number; count: number }> {
  const lines = parseLines((await cookies()).get(CART_COOKIE)?.value)
    .map((l) => ({ product: productBySlug(l.slug)!, qty: l.qty }))
    .filter((l) => l.product);
  return { lines, totalPaise: lines.reduce((a, l) => a + l.product.pricePaise * l.qty, 0), count: lines.reduce((a, l) => a + l.qty, 0) };
}
