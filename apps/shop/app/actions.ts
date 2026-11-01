'use server';

import { ecosystemApi, localUrl, PersonaKey } from '@cred/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { productBySlug } from '@/lib/catalog';
import { CART_COOKIE, currentShopper, gateway, orderCookie, parseLines, readCart, SHOPPER_COOKIE } from '@/lib/server';

const back = (form: FormData) => z.string().startsWith('/').catch('/').parse(form.get('back'));

export async function chooseShopper(form: FormData) {
  const key = PersonaKey.parse(form.get('persona'));
  (await cookies()).set(SHOPPER_COOKIE, key, { path: '/', sameSite: 'lax' });
  redirect(back(form));
}

async function writeCart(lines: { slug: string; qty: number }[]) {
  (await cookies()).set(CART_COOKIE, JSON.stringify(lines), { path: '/', sameSite: 'lax' });
}

export async function addToCart(form: FormData) {
  const slug = z.string().parse(form.get('slug'));
  if (!productBySlug(slug)) redirect('/');
  const lines = parseLines((await cookies()).get(CART_COOKIE)?.value);
  const line = lines.find((l) => l.slug === slug);
  if (line) line.qty = Math.min(9, line.qty + 1);
  else lines.push({ slug, qty: 1 });
  await writeCart(lines);
  redirect(form.get('buyNow') ? '/checkout' : '/cart');
}

export async function setQty(form: FormData) {
  const slug = z.string().parse(form.get('slug'));
  const qty = z.coerce.number().int().min(0).max(9).parse(form.get('qty'));
  const lines = parseLines((await cookies()).get(CART_COOKIE)?.value)
    .map((l) => (l.slug === slug ? { ...l, qty } : l))
    .filter((l) => l.qty > 0);
  await writeCart(lines);
  redirect('/cart');
}

const PayForm = z.discriminatedUnion('method', [
  z.object({ method: z.literal('card'), cardToken: z.string().min(1, 'Choose a card') }),
  z.object({ method: z.literal('upi'), vpa: z.string().regex(/^[\w.-]+@[\w]+$/, 'Enter a UPI ID like name@bank') }),
]);

/** Checkout: the gateway hands back a redirect to the bank's OTP page (card) or the UPI switch's PIN page. */
export async function pay(_: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const parsed = PayForm.safeParse({ method: form.get('method'), cardToken: form.get('cardToken') ?? undefined, vpa: form.get('vpa') ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Choose how to pay.' };
  const shopper = await currentShopper();
  const cart = await readCart();
  if (!shopper) return { error: 'Choose who is shopping first (top right).' };
  if (!cart.lines.length) return { error: 'Your cart is empty.' };

  const orderId = `SK${Date.now().toString(36).toUpperCase()}`;
  const description = cart.lines.length === 1 ? cart.lines[0]!.product.name : `${cart.lines[0]!.product.name} and ${cart.count - 1} more`;
  const { payment, nextAction } = await gateway(ecosystemApi.gateway.createPayment, {
    body: {
      orderId,
      amountPaise: cart.totalPaise,
      description: description.slice(0, 140),
      shopperPhone: shopper.phone,
      returnUrl: `${localUrl('shop')}/order/${orderId}`,
      instrument: parsed.data.method === 'card' ? { method: 'card', cardToken: parsed.data.cardToken } : { method: 'upi', vpa: parsed.data.vpa },
    },
  });
  (await cookies()).set(orderCookie(orderId), JSON.stringify(cart.lines.map((l) => ({ slug: l.product.slug, qty: l.qty }))), { path: '/', sameSite: 'lax' });
  if (!nextAction) return { error: payment.failureReason ?? 'Payment failed.' };
  redirect(nextAction.url); // Mock Bank OTP page, or the UPI PIN page
}

/** After a successful order the cart is emptied. */
export async function clearCart() {
  (await cookies()).delete(CART_COOKIE);
}
