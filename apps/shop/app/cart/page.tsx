import { Money } from '@cred/ui';
import { readCart } from '@/lib/server';
import { setQty } from '../actions';
import { Footer, Header } from '../Header';
import { ProductArt } from '../ProductTile';

export const dynamic = 'force-dynamic';

export default async function Cart() {
  const cart = await readCart();
  return (
    <>
      <Header back="/cart" />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Your cart</h1>
          {cart.lines.length === 0 ? (
            <p className="text-muted">
              Your cart is empty. <a href="/" className="text-accent underline">Keep shopping</a>
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
              {cart.lines.map(({ product: p, qty }) => (
                <li key={p.slug} className="flex items-center gap-4 p-4">
                  <div className="w-20 shrink-0">
                    <ProductArt p={p} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <a href={`/product/${p.slug}`} className="font-medium hover:underline">
                      {p.name}
                    </a>
                    <p className="text-sm text-muted">{p.brand}</p>
                  </div>
                  <form action={setQty} className="flex items-center gap-2 text-sm">
                    <input type="hidden" name="slug" value={p.slug} />
                    <label htmlFor={`qty-${p.slug}`} className="sr-only">
                      Quantity
                    </label>
                    <select id={`qty-${p.slug}`} name="qty" defaultValue={qty} className="rounded-sm border border-border bg-raised px-2 py-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button className="text-accent underline">Update</button>
                    <button name="qty" value="0" className="text-muted underline">
                      Remove
                    </button>
                  </form>
                  <Money paise={p.pricePaise * qty} className="w-28 text-right font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="flex h-fit flex-col gap-3 rounded-md border border-border bg-surface p-5">
          <div className="flex justify-between">
            <span>Items ({cart.count})</span>
            <Money paise={cart.totalPaise} />
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>Delivery</span>
            <span className="text-positive">Free</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-lg font-semibold">
            <span>Total</span>
            <Money paise={cart.totalPaise} />
          </div>
          {cart.lines.length ? (
            <a href="/checkout" className="grid h-12 place-items-center rounded-md bg-accent font-semibold text-accent-text hover:brightness-105">
              Proceed to checkout
            </a>
          ) : null}
        </aside>
      </main>
      <Footer />
    </>
  );
}
