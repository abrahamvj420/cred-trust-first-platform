import { Money } from '@cred/ui';
import { notFound } from 'next/navigation';
import { CATEGORIES, discountPct, productBySlug } from '@/lib/catalog';
import { addToCart } from '../../actions';
import { Footer, Header } from '../../Header';
import { ProductArt } from '../../ProductTile';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = productBySlug(slug);
  if (!p) notFound();
  return (
    <>
      <Header back={`/product/${slug}`} />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-8 md:grid-cols-2">
        <ProductArt p={p} large />
        <div className="flex flex-col gap-4">
          <a href={`/?c=${p.category}`} className="text-sm text-accent">
            {CATEGORIES.find((c) => c.id === p.category)!.label}
          </a>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-sm text-muted">
            {p.brand} · ★ {p.rating} · {p.reviews.toLocaleString('en-IN')} ratings
          </p>
          <div className="flex items-baseline gap-3">
            <Money paise={p.pricePaise} className="text-3xl font-bold" />
            <Money paise={p.mrpPaise} className="text-muted line-through" />
            <span className="font-semibold text-positive">{discountPct(p)}% off</span>
          </div>
          <p className="text-xs text-muted">Inclusive of all taxes. Pay by card or UPI. EMI available on cards through your bank.</p>
          <p>{p.blurb}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {p.specs.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-accent">•</span>
                {s}
              </li>
            ))}
          </ul>
          <form action={addToCart} className="flex flex-wrap gap-3">
            <input type="hidden" name="slug" value={p.slug} />
            <button className="h-12 rounded-md border border-accent px-6 font-semibold text-accent hover:bg-raised">Add to cart</button>
            <button name="buyNow" value="1" className="h-12 rounded-md bg-accent px-6 font-semibold text-accent-text hover:brightness-105">
              Buy now
            </button>
          </form>
          <p className="text-sm text-muted">Free delivery by Thursday · 7-day returns</p>
        </div>
      </main>
      <Footer />
    </>
  );
}
