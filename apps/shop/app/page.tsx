import { Money } from '@cred/ui';
import { PRODUCTS } from '@/lib/catalog';
import { ShopperBar } from './ShopperBar';

export default function Store() {
  return (
    <>
      <ShopperBar back="/" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Top picks</h1>
        <ul className="grid gap-4 sm:grid-cols-3">
          {PRODUCTS.map((p) => (
            <li key={p.slug} className="rounded-md border border-border p-4">
              <a href={`/product/${p.slug}`} className="flex flex-col gap-2">
                <span className="font-medium">{p.name}</span>
                <Money paise={p.pricePaise} className="text-lg font-semibold" />
                <span className="text-sm text-muted">{p.blurb}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
