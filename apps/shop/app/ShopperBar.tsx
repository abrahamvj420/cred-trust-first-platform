import { DEMO_PERSONAS } from '@cred/types';
import { chooseShopper } from './actions';
import { currentShopper } from '@/lib/server';

export async function ShopperBar({ back }: { back: string }) {
  const shopper = await currentShopper();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="text-xl font-bold text-accent">ShopKart</a>
        <form action={chooseShopper} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="back" value={back} />
          <label htmlFor="persona" className="text-muted">Shopping as</label>
          <select id="persona" name="persona" defaultValue={shopper?.key ?? ''} className="rounded-sm border border-border bg-raised px-2 py-1">
            <option value="" disabled>Choose a demo shopper</option>
            {DEMO_PERSONAS.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
          <button className="rounded-sm border border-border px-2 py-1 hover:border-accent">Switch</button>
        </form>
      </div>
    </header>
  );
}
