import { buildPersonaWorld, bureauScoreFor, seedPerson, signupFixture, signupPersona } from '@cred/db/seed';
import { conflict, handlers, notFound } from '@cred/service-kit';
import { ecosystemApi, SIGNUP_KEY_PREFIX, TxnCategory } from '@cred/types';
import { maskPhone, simDate, type Ctx } from './context';

const BUREAU = 'Trustline Credit Bureau';
const SHARED_STATEMENTS = 6;
const SHARED_TXN_DAYS = 90;

const withParam = (url: string, key: string, value: string) => `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

/** The mock credit bureau, and Mock Bank's side of someone signing up in a payment app. */
export function signupHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.bureau.scoreCheck, async ({ body }) => {
    const check = await db.bureauCheck.create({ data: { ...body, score: bureauScoreFor(body.phone) } });
    return { checkRef: check.id, bureauName: BUREAU, score: check.score, checkedAt: check.createdAt.toISOString() };
  });

  /** In the simulation the person's life at the institutions begins when a payment app first asks about them. */
  h.on(ecosystemApi.bank.enrol, async ({ body }) => {
    if (!(await db.person.findUnique({ where: { phone: body.phone } }))) {
      const today = await simDate(db);
      const persona = signupPersona(body.demoKey, body.name, body.phone);
      await seedPerson(db, buildPersonaWorld(signupFixture(body.demoKey, body.phone, body.dob, today), { today, persona }));
    }
    const person = await db.person.findUniqueOrThrow({ where: { phone: body.phone }, include: { vpas: true } });
    return { customerRef: person.id, vpa: person.vpas[0]!.handle };
  });

  h.on(ecosystemApi.bank.startCardLink, async ({ body }) => {
    const card = await db.creditCardAccount.findFirst({ where: { personId: body.customerRef } });
    if (!card) throw notFound('Card');
    const link = await db.cardLink.create({ data: { cardAccountId: card.id, clientRef: body.clientRef, requester: 'CRED', last4: body.last4, network: body.network, returnUrl: body.returnUrl } });
    return { linkRef: link.id, approvalUrl: `${ctx.pagesUrl}/bank/link/${link.id}` };
  });

  h.on(ecosystemApi.bank.cardLink, async ({ params }) => {
    const l = await db.cardLink.findUnique({ where: { id: params.linkRef }, include: { card: { include: { person: true } } } });
    if (!l) throw notFound('Card link');
    return {
      linkRef: l.id,
      bankName: l.card.bankName,
      requester: l.requester,
      customerName: l.card.person.name,
      phoneMasked: maskPhone(l.card.person.phone),
      cardMasked: `XXXX XXXX XXXX ${l.last4}`,
      network: l.network,
      status: l.status as 'pending',
    };
  });

  h.on(ecosystemApi.bank.decideCardLink, async ({ params, body }) => {
    const l = await db.cardLink.findUnique({ where: { id: params.linkRef }, include: { card: true } });
    if (!l) throw notFound('Card link');
    if (l.status !== 'pending') throw conflict('already_decided', 'This request has already been answered');
    if (body.decision === 'reject') {
      await db.cardLink.update({ where: { id: l.id }, data: { status: 'rejected' } });
      return { status: 'rejected' as const, returnUrl: withParam(l.returnUrl, 'status', 'rejected') };
    }
    const card = await db.creditCardAccount.update({ where: { id: l.cardAccountId }, data: { last4: l.last4, network: l.network } });
    await db.cardLink.update({ where: { id: l.id }, data: { status: 'approved' } });

    const statements = (await db.cardStatement.findMany({ where: { cardAccountId: card.id }, orderBy: { periodEnd: 'desc' }, take: SHARED_STATEMENTS + 1, include: { payments: true } })).reverse();
    const today = await simDate(db);
    const since = new Date(Date.parse(`${today}T00:00:00+05:30`) - SHARED_TXN_DAYS * 86_400_000);
    const charges = await db.cardCharge.findMany({ where: { cardAccountId: card.id, postedAt: { gte: since } } });
    await ctx.outbox.emit('bank.card.linked', {
      clientRef: l.clientRef,
      customerRef: card.personId,
      cardRef: card.id,
      bankName: card.bankName,
      network: card.network,
      last4: card.last4,
      limitPaise: card.limitPaise,
      outstandingPaise: card.outstandingPaise,
      billingDay: card.billingDay,
      dueDay: card.dueDay,
      statements: statements.map((s) => {
        const p = s.payments[0];
        return {
          statementRef: s.id,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          totalDuePaise: s.totalDuePaise,
          minDuePaise: s.minDuePaise,
          paidPaise: s.paidPaise,
          dueDate: s.dueDate,
          payment: p ? { paymentRef: p.id, amountPaise: p.amountPaise, receivedAt: p.receivedAt.toISOString(), onTime: p.onTime } : null,
        };
      }),
      transactions: charges.map((c) => ({ transactionRef: c.id, merchant: c.merchant, category: TxnCategory.catch('other').parse(c.category), amountPaise: c.amountPaise, postedAt: c.postedAt.toISOString() })),
    });
    return { status: 'approved' as const, returnUrl: withParam(l.returnUrl, 'status', 'approved') };
  });

  h.on(ecosystemApi.gateway.shoppers, async () => {
    const people = await db.person.findMany({ include: { vpas: true }, orderBy: { name: 'asc' } });
    return { shoppers: people.map((p) => ({ key: p.personaKey, name: p.name, phone: p.phone, city: p.city, vpa: p.vpas[0]?.handle ?? null })) };
  });

  h.on(ecosystemApi.sim.resetSignups, async () => {
    const where = { personaKey: { startsWith: SIGNUP_KEY_PREFIX } };
    const people = await db.person.findMany({ where, select: { id: true, phone: true } });
    const phones = people.map((p) => p.phone);
    await db.bureauCheck.deleteMany();
    await db.gatewayPayment.deleteMany({ where: { shopperPhone: { in: phones } } });
    await db.person.deleteMany({ where });
    return { removed: people.length };
  });
}

