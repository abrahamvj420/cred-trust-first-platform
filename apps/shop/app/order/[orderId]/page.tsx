import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { cookies } from 'next/headers';
import { productBySlug } from '@/lib/catalog';
import { gateway, orderCookie, parseLines } from '@/lib/server';
import { Footer, Header } from '../../Header';
import { ClearCart } from './ClearCart';

export const dynamic = 'force-dynamic';

export default async function Order({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ paymentId?: string }> }) {
  const { orderId } = await params;
  const { paymentId } = await searchParams;
  const payment = paymentId ? (await gateway(ecosystemApi.gateway.payment, { params: { paymentId } })).payment : null;
  const ok = payment?.status === 'succeeded';
  const items = parseLines((await cookies()).get(orderCookie(orderId))?.value)
    .map((l) => ({ p: productBySlug(l.slug)!, qty: l.qty }))
    .filter((x) => x.p);
  return (
    <>
      <Header back="/" />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        {ok ? <ClearCart /> : null}
        <div className={`rounded-md border p-6 ${ok ? 'border-positive' : 'border-negative'} bg-surface`}>
          <h1 className="text-2xl font-semibold">{ok ? 'Thank you, your order is placed' : 'Payment not completed'}</h1>
          <p className="text-muted">
            Order {orderId}
            {ok ? ' · arriving by Thursday' : ''}
          </p>
          {payment && !ok ? <p className="mt-2 text-sm">{payment.failureReason ?? `Status: ${payment.status.replace(/_/g, ' ')}`}. Nothing was charged.</p> : null}
        </div>
        {items.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
            {items.map(({ p, qty }) => (
              <li key={p.slug} className="flex justify-between gap-3 p-4 text-sm">
                <span>
                  {p.name} × {qty}
                </span>
                <Money paise={p.pricePaise * qty} />
              </li>
            ))}
          </ul>
        ) : null}
        {payment ? (
          <p className="text-sm text-muted">
            Paid <Money paise={payment.amountPaise} /> by {payment.method === 'upi' ? 'UPI' : 'card'}.
          </p>
        ) : null}
        <a href="/" className="text-accent underline">
          Continue shopping
        </a>
      </main>
      <Footer />
    </>
  );
}
