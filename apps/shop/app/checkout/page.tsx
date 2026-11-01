import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { redirect } from 'next/navigation';
import { currentShopper, gateway, readCart } from '@/lib/server';
import { Footer, Header } from '../Header';
import { PayForm } from './PayForm';

export const dynamic = 'force-dynamic';

export default async function Checkout() {
  const [shopper, cart] = await Promise.all([currentShopper(), readCart()]);
  if (!cart.lines.length) redirect('/cart');
  const cards = shopper ? (await gateway(ecosystemApi.gateway.savedCards, { params: { shopperPhone: shopper.phone } })).cards : [];
  return (
    <>
      <Header back="/checkout" />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_22rem]">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          {shopper ? (
            <>
              <div className="rounded-md border border-border bg-surface p-4 text-sm">
                <p className="font-medium">Deliver to {shopper.name}</p>
                <p className="text-muted">{shopper.city} · +91 {shopper.phone}</p>
              </div>
              <PayForm totalPaise={cart.totalPaise} cards={cards} vpa={shopper.vpa} />
            </>
          ) : (
            <p className="text-muted">Choose who is shopping (top right) to see saved cards and UPI.</p>
          )}
        </section>
        <aside className="flex h-fit flex-col gap-3 rounded-md border border-border bg-surface p-5">
          <h2 className="font-semibold">Order summary</h2>
          {cart.lines.map(({ product: p, qty }) => (
            <div key={p.slug} className="flex justify-between gap-3 text-sm">
              <span>
                {p.name} × {qty}
              </span>
              <Money paise={p.pricePaise * qty} />
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-3 text-lg font-semibold">
            <span>Total</span>
            <Money paise={cart.totalPaise} />
          </div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
