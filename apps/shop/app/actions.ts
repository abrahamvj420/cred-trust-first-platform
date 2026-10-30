'use server';

import { ecosystemApi, localUrl, PersonaKey } from '@cred/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { productBySlug } from '@/lib/catalog';
import { currentShopper, gateway, SHOPPER_COOKIE } from '@/lib/server';

export async function chooseShopper(form: FormData) {
  const key = PersonaKey.parse(form.get('persona'));
  (await cookies()).set(SHOPPER_COOKIE, key, { path: '/', sameSite: 'lax' });
  redirect(z.string().startsWith('/').catch('/').parse(form.get('back')));
}

const PayForm = z.object({ slug: z.string(), cardToken: z.string().min(1, 'Choose a card') });

export async function pay(_: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const parsed = PayForm.safeParse({ slug: form.get('slug'), cardToken: form.get('cardToken') });
  if (!parsed.success) return { error: 'Choose a card to pay with.' };
  const product = productBySlug(parsed.data.slug);
  const shopper = await currentShopper();
  if (!product || !shopper) return { error: 'Choose who is shopping first.' };

  const orderId = `SK${Date.now().toString(36).toUpperCase()}`;
  const { payment, nextAction } = await gateway(ecosystemApi.gateway.createPayment, {
    body: {
      orderId,
      amountPaise: product.pricePaise,
      description: product.name,
      shopperPhone: shopper.phone,
      returnUrl: `${localUrl('shop')}/order/${orderId}`,
      instrument: { method: 'card', cardToken: parsed.data.cardToken },
    },
  });
  if (!nextAction) return { error: payment.failureReason ?? 'Payment failed.' };
  redirect(nextAction.url); // Mock Bank 3-D Secure page
}
