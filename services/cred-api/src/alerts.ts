import type { AlertKind } from '@cred/types';
import type { Ctx } from './context';
import { toAlert } from './mappers';

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/** An alert is information for the member, never an offer. `sourceRef` makes it idempotent. */
export async function raiseAlert(ctx: Ctx, memberId: string, a: { kind: AlertKind; title: string; body: string; href?: string | null; sourceRef?: string | null }): Promise<void> {
  try {
    const row = await ctx.db.memberAlert.create({
      data: { memberId, kind: a.kind, title: a.title, body: a.body, href: a.href ?? null, sourceRef: a.sourceRef ?? null, simDate: await ctx.simDate(), createdAt: await ctx.simNow() },
    });
    ctx.hub.member(memberId, { type: 'alert.created', data: { alert: toAlert(row) } });
  } catch (e) {
    if (!isUnique(e)) throw e;
  }
}

export const dataUpdated = (ctx: Ctx, memberId: string, area: 'cards' | 'ladder' | 'income' | 'holdings' | 'insurance' | 'wellness' | 'consent' | 'goals' | 'complaints' | 'loans') =>
  ctx.hub.member(memberId, { type: 'data.updated', data: { area } });
