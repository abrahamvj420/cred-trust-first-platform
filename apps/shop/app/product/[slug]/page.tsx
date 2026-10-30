import { Money } from '@cred/ui';
import { notFound } from 'next/navigation';
import { productBySlug } from '@/lib/catalog';
import { ShopperBar } from '../../ShopperBar';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = productBySlug(slug);
  if (!p) notFound();
  return (
    <>
      <ShopperBar back={`/product/${slug}`} />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <Money paise={p.pricePaise} className="text-3xl font-bold" />
        <p className="text-muted">{p.blurb}</p>
        <ul className="list-disc pl-5 text-sm">
          {p.specs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <a href={`/checkout/${p.slug}`} className="inline-flex h-12 w-fit items-center rounded-md bg-accent px-6 font-semibold text-accent-text">
          Buy now
        </a>
      </main>
    </>
  );
}
