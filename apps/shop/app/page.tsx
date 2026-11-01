import { CATEGORIES, PRODUCTS, type Category } from '@/lib/catalog';
import { Footer, Header } from './Header';
import { ProductTile } from './ProductTile';

export default async function Store({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const category = CATEGORIES.find((x) => x.id === c)?.id as Category | undefined;
  const products = category ? PRODUCTS.filter((p) => p.category === category) : PRODUCTS;
  return (
    <>
      <Header back={category ? `/?c=${category}` : '/'} />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        {!category ? (
          <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-8 shadow-e1">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Big Tech Days</p>
            <h1 className="text-3xl font-bold tracking-tight">Up to 30% off laptops, phones and audio</h1>
            <p className="max-w-xl text-muted">Free delivery, 7-day returns and secure checkout with saved cards or UPI.</p>
          </section>
        ) : null}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{category ? CATEGORIES.find((x) => x.id === category)!.label : 'Top picks'}</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li key={p.slug}>
                <ProductTile p={p} />
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
