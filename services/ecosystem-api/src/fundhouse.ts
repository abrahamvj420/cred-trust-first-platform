import { handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi } from '@cred/types';
import { simDate, simNow, type Ctx } from './context';

/** Meridian Mutual Fund (and Mock Bank for fixed deposits): redemptions on the investor's instruction. */
export function fundhouseHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.fundhouse.redeem, async ({ body }) => {
    const holding = await db.fundHolding.findFirst({ where: { folio: body.folio, scheme: { code: body.schemeCode } }, include: { scheme: true, liens: { where: { status: 'marked' } } } });
    if (!holding) throw notFound('Holding');
    const free = holding.units - holding.liens.reduce((a, l) => a + l.units, 0);
    const units = Number((body.amountPaise / holding.scheme.navPaise).toFixed(3));
    if (units > free + 1e-6) throw new HttpError(422, 'units_pledged', 'Some units are pledged against a loan and can’t be sold until it’s repaid');
    const now = await simNow(db);
    const share = units / holding.units;
    const r = await db.redemption.create({ data: { holdingId: holding.id, amountPaise: body.amountPaise, units, status: 'completed', clientRef: body.clientRef } });
    await db.fundHolding.update({ where: { id: holding.id }, data: { units: holding.units - units, costPaise: Math.round(holding.costPaise * (1 - share)) } });
    const account = await db.bankAccount.findFirst({ where: { personId: holding.personId } });
    if (account) {
      await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: body.amountPaise } } });
      await db.bankTxn.create({ data: { accountId: account.id, kind: 'credit', amountPaise: body.amountPaise, narration: `REDEMPTION ${holding.scheme.code}`, at: now } });
    }
    await ctx.outbox.emit('fundhouse.redemption.completed', {
      redemptionRef: r.id,
      clientRef: body.clientRef,
      folio: holding.folio,
      schemeCode: holding.scheme.code,
      units,
      amountPaise: body.amountPaise,
      completedAt: now.toISOString(),
    });
    return { redemptionRef: r.id, status: 'completed' as const };
  });

  h.on(ecosystemApi.fundhouse.portfolio, async ({ params }) => {
    const person = await db.person.findUnique({ where: { id: params.customerRef }, include: { fundHoldings: { include: { scheme: { include: { fundHouse: true } }, liens: { where: { status: 'marked' } } } } } });
    if (!person) throw notFound('Investor');
    return {
      investorName: person.name,
      holdings: person.fundHoldings.map((hd) => ({
        amc: hd.scheme.fundHouse.name,
        folio: hd.folio,
        schemeCode: hd.scheme.code,
        schemeName: hd.scheme.name,
        units: hd.units,
        navPaise: hd.scheme.navPaise,
        valuePaise: Math.round(hd.units * hd.scheme.navPaise),
        costPaise: hd.costPaise,
        lienUnits: hd.liens.reduce((a, l) => a + l.units, 0),
      })),
    };
  });

  h.on(ecosystemApi.fundhouse.nav, async () => ({
    asOf: await simDate(db),
    schemes: (await db.scheme.findMany({ orderBy: { code: 'asc' } })).map((s) => ({ code: s.code, name: s.name, navPaise: s.navPaise })),
  }));

  /** Breaking an FD early: the bank pays the amount less its early-withdrawal penalty. */
  h.on(ecosystemApi.bank.withdrawFd, async ({ params, body }) => {
    const fd = await db.fixedDeposit.findUnique({ where: { id: params.fdRef } });
    if (!fd) throw notFound('Fixed deposit');
    if (body.amountPaise > fd.principalPaise) throw new HttpError(422, 'above_balance', 'That’s more than the deposit');
    const today = await simDate(db);
    const years = Math.max(0, (Date.parse(today) - Date.parse(fd.openedOn)) / (365 * 86_400_000));
    const penalty = Math.round(body.amountPaise * 0.01 * years);
    const now = await simNow(db);
    if (body.amountPaise === fd.principalPaise) await db.fixedDeposit.delete({ where: { id: fd.id } });
    else await db.fixedDeposit.update({ where: { id: fd.id }, data: { principalPaise: fd.principalPaise - body.amountPaise } });
    const account = await db.bankAccount.findFirst({ where: { personId: fd.personId } });
    if (account) {
      await db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: body.amountPaise - penalty } } });
      await db.bankTxn.create({ data: { accountId: account.id, kind: 'credit', amountPaise: body.amountPaise - penalty, narration: `FD WITHDRAWAL ${fd.id.toUpperCase()}`, at: now } });
    }
    return { withdrawalRef: `fdw_${crypto.randomUUID()}`, creditedPaise: body.amountPaise - penalty, penaltyPaise: penalty };
  });
}
