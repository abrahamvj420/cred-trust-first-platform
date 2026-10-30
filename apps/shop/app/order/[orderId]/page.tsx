import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { gateway } from '@/lib/server';
import { ShopperBar } from '../../ShopperBar';

export const dynamic = 'force-dynamic';

export default async function Order({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ paymentId?: string }> }) {
  const { orderId } = await params;
  const { paymentId } = await searchParams;
  const payment = paymentId ? (await gateway(ecosystemApi.gateway.payment, { params: { paymentId } })).payment : null;
  const ok = payment?.status === 'succeeded';
  return (
    <>
      <ShopperBar back="/" />
      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-10">
        <h1 className="text-2xl font-semibold">{ok ? 'Order placed' : 'Payment not completed'}</h1>
        <p className="text-muted">Order {orderId}</p>
        {payment ? (
          <p>
            <Money paise={payment.amountPaise} /> · {payment.status.replace(/_/g, ' ')}
            {payment.failureReason ? ` · ${payment.failureReason}` : ''}
          </p>
        ) : null}
        <a href="/" className="text-accent underline">Continue shopping</a>
      </main>
    </>
  );
}
