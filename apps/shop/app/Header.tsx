import { DEMO_PERSONAS } from '@cred/types';
import { CATEGORIES } from '@/lib/catalog';
import { currentShopper, readCart } from '@/lib/server';
import { chooseShopper } from './actions';

/** Store header: logo, categories, who's shopping (demo), cart. */
export async function Header({ back }: { back: string }) {
  const [shopper, cart] = await Promise.all([currentShopper(), readCart()]);
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="text-2xl font-bold tracking-tight text-accent">
          ShopKart
        </a>
        <div className="flex flex-wrap items-center gap-4">
          <form action={chooseShopper} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="back" value={back} />
            <label htmlFor="persona" className="text-muted">
              Shopping as
            </label>
            <select id="persona" name="persona" defaultValue={shopper?.key ?? ''} className="rounded-sm border border-border bg-raised px-2 py-1.5">
              <option value="" disabled>
                Choose a demo shopper
              </option>
              {DEMO_PERSONAS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="rounded-sm border border-border px-3 py-1.5 hover:border-accent">Switch</button>
          </form>
          <a href="/cart" className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-accent" aria-label={`Cart, ${cart.count} items`}>
            Cart <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-text">{cart.count}</span>
          </a>
        </div>
      </div>
      <nav aria-label="Categories" className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 pb-2 text-sm">
        {CATEGORIES.map((c) => (
          <a key={c.id} href={`/?c=${c.id}`} className="whitespace-nowrap py-1 text-muted hover:text-text">
            {c.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-6 text-xs text-muted">
        <span>ShopKart · a demo store with synthetic products. No real orders or payments.</span>
        <span>Free delivery over ₹499 · 7-day returns · Secure checkout</span>
      </div>
    </footer>
  );
}
