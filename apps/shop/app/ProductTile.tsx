import { Money } from '@cred/ui';
import { discountPct, type Product } from '@/lib/catalog';

/** A product card; the coloured tile stands in for a photo. */
export function ProductArt({ p, large = false }: { p: Product; large?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-md border border-border bg-gradient-to-br from-raised to-surface ${large ? 'aspect-square text-6xl' : 'aspect-[4/3] text-3xl'} font-bold tracking-tight text-accent`} aria-hidden>
      {p.mark}
    </div>
  );
}

export function ProductTile({ p }: { p: Product }) {
  return (
    <a href={`/product/${p.slug}`} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 transition-calm hover:border-accent hover:shadow-e2">
      <ProductArt p={p} />
      <span className="text-xs text-muted">{p.brand}</span>
      <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
      <span className="text-xs text-muted">
        ★ {p.rating} · {p.reviews.toLocaleString('en-IN')} ratings
      </span>
      <span className="flex items-baseline gap-2">
        <Money paise={p.pricePaise} className="text-lg font-semibold" />
        <Money paise={p.mrpPaise} className="text-xs text-muted line-through" />
        <span className="text-xs font-semibold text-positive">{discountPct(p)}% off</span>
      </span>
    </a>
  );
}
