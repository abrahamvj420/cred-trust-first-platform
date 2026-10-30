import { ecosystemApi } from '@cred/types';
import { Money } from '@cred/ui';
import { notFound } from 'next/navigation';
import { productBySlug } from '@/lib/catalog';
import { currentShopper, gateway } from '@/lib/server';
import { ShopperBar } from '../../ShopperBar';
import { PayForm } from './PayForm';

export const dynamic = 'force-dynamic';

export default async function Checkout({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = productBySlug(slug);
  if (!p) notFound();
  const shopper = await currentShopper();
  const cards = shopper ? (await gateway(ecosystemApi.gateway.savedCards, { params: { shopperPhone: shopper.phone } })).cards : [];
  return (
    <>
      <ShopperBar back={`/checkout/${slug}`} />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <div className="flex justify-between rounded-md border border-border p-4">
          <span>{p.name}</span>
          <Money paise={p.pricePaise} className="font-semibold" />
        </div>
        {shopper ? <PayForm slug={p.slug} pricePaise={p.pricePaise} cards={cards} /> : <p className="text-muted">Choose who is shopping (top right) to see saved cards.</p>}
      </main>
    </>
  );
}
