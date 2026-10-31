import { coinsForBillPayment } from '@cred/engine';
import { catalog } from '@cred/db/seed';
import { conflict, handlers, HttpError, notFound } from '@cred/service-kit';
import { credApi, DEMO_PERSONAS, ecosystemApi, localUrl, type SessionClaims } from '@cred/types';
import { randomBytes } from 'node:crypto';
import type { Ctx } from './context';
import { activeRules, runBalanceSwitch } from './engine-runner';
import { toCard, toPayment, toReward, toStatement, toTxn, toUpi } from './mappers';

type H = ReturnType<typeof handlers>;
type Auth = SessionClaims;

const credAppUrl = () => process.env.CRED_APP_URL ?? localUrl('cred');

/** Demo rewards catalogue (synthetic brands). */
export const REWARDS = [
  { id: 'rw_freshbasket_100', title: '₹100 off groceries', brand: 'FreshBasket', description: 'On orders above ₹799.', costCoins: 5_000, valuePaise: 100_00 },
  { id: 'rw_fuel_150', title: '₹150 fuel cashback', brand: 'FuelPoint', description: 'On a fill of ₹1,000 or more.', costCoins: 7_500, valuePaise: 150_00 },
  { id: 'rw_streambox_month', title: 'One month of StreamBox', brand: 'StreamBox', description: 'Premium plan, one screen.', costCoins: 12_000, valuePaise: 199_00 },
  { id: 'rw_shopkart_500', title: '₹500 ShopKart voucher', brand: 'ShopKart', description: 'On electronics above ₹5,000.', costCoins: 25_000, valuePaise: 500_00 },
] as const;

export function moneyHandlers(ctx: Ctx, h: H) {
  const { db } = ctx;

  const memberCard = async (memberId: string, cardId: string) => {
    const card = await db.card.findUnique({ where: { id: cardId }, include: { statements: { orderBy: { periodEnd: 'desc' }, take: 1 } } });
    if (!card || card.memberId !== memberId) throw notFound('Card');
    return card;
  };
  const coinBalance = async (memberId: string) => (await db.rewardEntry.aggregate({ where: { memberId }, _sum: { coins: true } }))._sum.coins ?? 0;

  h.on<typeof credApi.member.cards, Auth>(credApi.member.cards, async ({ auth }) => {
    const cards = await db.card.findMany({ where: { memberId: auth.memberId }, include: { statements: { orderBy: { periodEnd: 'desc' }, take: 1 } } });
    return { cards: cards.map((c) => toCard(c, c.statements[0])) };
  });

  h.on<typeof credApi.member.card, Auth>(credApi.member.card, async ({ auth, params }) => {
    const card = await memberCard(auth.memberId, params.cardId);
    const latest = card.statements[0] ?? null;
    const payments = latest ? await db.billPayment.findMany({ where: { statementId: latest.id }, orderBy: { paidAt: 'desc' } }) : [];
    const rows = await db.cardTransaction.findMany({ where: { cardId: card.id }, orderBy: { postedAt: 'desc' }, take: 30 });
    const converted = new Set(
      (await db.offer.findMany({ where: { memberId: auth.memberId, status: 'accepted', triggerRef: { in: rows.map((r) => r.externalRef) } } })).map((o) => o.triggerRef),
    );
    const min = activeRules().memberEmiMinPaise;
    return {
      card: toCard(card, latest),
      statement: latest ? toStatement(latest) : null,
      payments: payments.map(toPayment),
      transactions: rows.map((t) => ({ ...toTxn(t), convertible: t.amountPaise >= min && !converted.has(t.externalRef) })),
    };
  });

  /**
   * Bill pay: always available, never blocked by offers. Full, minimum or a
   * custom amount; partial payments are recorded as such (Card-Balance Switch reads them).
   */
  h.on<typeof credApi.member.payBill, Auth>(credApi.member.payBill, async ({ auth, params, body }) => {
    const card = await memberCard(auth.memberId, params.cardId);
    const statement = card.statements[0];
    if (!statement) throw conflict('no_statement', 'There’s no bill on this card yet');
    const remaining = Math.max(0, statement.totalDuePaise - statement.paidPaise);
    if (remaining === 0) throw conflict('nothing_due', 'This bill is already paid');

    const amount =
      body.kind === 'full' ? remaining : body.kind === 'minimum' ? Math.max(0, statement.minDuePaise - statement.paidPaise) : body.amountPaise!;
    if (amount <= 0) throw conflict('minimum_already_paid', 'You’ve already paid the minimum due');
    if (amount > card.outstandingPaise) throw new HttpError(422, 'overpayment', 'That’s more than your card balance');
    const kind = amount >= remaining ? 'full' : body.kind === 'minimum' ? 'minimum' : 'custom';

    const pending = await db.billPayment.create({
      data: { statementId: statement.id, kind, source: body.source, amountPaise: amount, paidAt: new Date(), onTime: true },
    });
    let bank;
    try {
      bank = await ctx.partner(ecosystemApi.bank.payCardBill, {
        body: { cardRef: card.cardRef, statementRef: statement.externalRef, amountPaise: amount, source: body.source, clientRef: pending.id },
      });
    } catch (e) {
      await db.billPayment.delete({ where: { id: pending.id } });
      throw e;
    }

    const paid = statement.paidPaise + amount;
    const [payment, updatedStatement, updatedCard] = await db.$transaction([
      db.billPayment.update({ where: { id: pending.id }, data: { externalRef: bank.paymentRef, paidAt: new Date(bank.receivedAt), onTime: bank.onTime } }),
      db.statement.update({ where: { id: statement.id }, data: { paidPaise: paid, status: paid >= statement.totalDuePaise ? 'paid' : 'partial' } }),
      db.card.update({ where: { id: card.id }, data: { outstandingPaise: bank.outstandingPaise } }),
    ]);

    const coins = coinsForBillPayment(amount, bank.onTime, activeRules());
    if (coins > 0) {
      await db.rewardEntry.create({
        data: { memberId: auth.memberId, kind: 'earned', coins, description: 'Bill paid on time', sourceRef: payment.id, at: payment.paidAt },
      });
    }
    await ctx.audit({
      memberId: auth.memberId,
      actor: 'member',
      action: kind === 'full' ? 'bill.paid_full' : 'bill.paid_partial',
      target: statement.id,
      details: { amountPaise: amount, kind, source: body.source, onTime: bank.onTime, remainingPaise: Math.max(0, statement.totalDuePaise - paid) },
    });
    // Card-Balance Switch: a part payment leaves a balance that will carry. The payment itself is already done.
    const left = Math.max(0, statement.totalDuePaise - paid);
    if (left > 0) {
      setImmediate(() => {
        runBalanceSwitch(ctx, auth.memberId, { statementRef: statement.externalRef, remainingPaise: left, paidPaise: paid }).catch((e) => ctx.log.error({ err: e }, 'balance switch run failed'));
      });
    }
    return { payment: toPayment(payment), statement: toStatement(updatedStatement), card: toCard(updatedCard, updatedStatement), coinsEarned: coins };
  });

  // ── UPI ─────────────────────────────────────────────────────────────────────

  h.on<typeof credApi.member.upiContacts, Auth>(credApi.member.upiContacts, async ({ auth }) => {
    const me = await db.member.findUniqueOrThrow({ where: { id: auth.memberId } });
    const recent = await db.upiTransaction.findMany({ where: { memberId: auth.memberId, status: 'success' }, orderBy: { createdAt: 'desc' } });
    const seen = new Set<string>();
    const contacts: { name: string; vpa: string; recent: boolean }[] = [];
    for (const r of recent) {
      if (seen.has(r.payeeVpa)) continue;
      seen.add(r.payeeVpa);
      contacts.push({ name: r.payeeName ?? r.payeeVpa, vpa: r.payeeVpa, recent: true });
    }
    // Demo phone contacts who are on UPI
    const book = [
      ...DEMO_PERSONAS.filter((p) => p.vpa !== me.vpa).map((p) => ({ name: p.name, vpa: p.vpa })),
      ...catalog.OTHER_VPAS.filter((v) => v.handle !== catalog.SHOPKART.vpa).map((v) => ({ name: v.name, vpa: v.handle })),
    ];
    for (const c of book) if (!seen.has(c.vpa)) contacts.push({ ...c, recent: false });
    return { contacts };
  });

  h.on<typeof credApi.member.upiResolve, Auth>(credApi.member.upiResolve, async ({ query }) => {
    if (!/^[\w.-]+@[\w]+$/.test(query.vpa)) return { vpa: query.vpa, name: null, valid: false };
    return ctx.partner(ecosystemApi.upi.resolveVpa, { params: { vpa: query.vpa.toLowerCase() } });
  });

  h.on<typeof credApi.member.upiPay, Auth>(credApi.member.upiPay, async ({ auth, body }) => {
    const me = await db.member.findUniqueOrThrow({ where: { id: auth.memberId } });
    const payeeVpa = body.payeeVpa.toLowerCase();
    const who = await ctx.partner(ecosystemApi.upi.resolveVpa, { params: { vpa: payeeVpa } });
    if (!who.valid) throw new HttpError(422, 'invalid_payee', 'That UPI ID doesn’t exist');
    const row = await db.upiTransaction.create({
      data: { memberId: me.id, payerVpa: me.vpa, payeeVpa, payeeName: who.name, amountPaise: body.amountPaise, note: body.note ?? null, status: 'awaiting_pin', createdAt: await ctx.simNow() },
    });
    try {
      const init = await ctx.partner(ecosystemApi.upi.initiate, {
        body: { payerVpa: me.vpa, payeeVpa, amountPaise: body.amountPaise, note: body.note ?? null, clientRef: row.id, returnUrl: `${credAppUrl()}/upi/${row.id}` },
      });
      const updated = await db.upiTransaction.update({ where: { id: row.id }, data: { upiTxnRef: init.upiTxnRef } });
      await ctx.audit({ memberId: me.id, actor: 'member', action: 'upi.initiated', target: row.id, details: { amountPaise: body.amountPaise, payeeVpa } });
      return { payment: toUpi(updated), pinUrl: init.pinUrl };
    } catch (e) {
      await db.upiTransaction.update({ where: { id: row.id }, data: { status: 'failed', failureReason: 'Could not start the payment' } });
      throw e;
    }
  });

  h.on<typeof credApi.member.upiStatus, Auth>(credApi.member.upiStatus, async ({ auth, params }) => {
    const u = await db.upiTransaction.findUnique({ where: { id: params.paymentId } });
    if (!u || u.memberId !== auth.memberId) throw notFound('UPI payment');
    return { payment: toUpi(u) };
  });

  h.on<typeof credApi.member.upiHistory, Auth>(credApi.member.upiHistory, async ({ auth }) => ({
    payments: (await db.upiTransaction.findMany({ where: { memberId: auth.memberId, status: { not: 'awaiting_pin' } }, orderBy: { createdAt: 'desc' }, take: 30 })).map(toUpi),
  }));

  // ── Rewards ─────────────────────────────────────────────────────────────────

  h.on<typeof credApi.member.rewards, Auth>(credApi.member.rewards, async ({ auth }) => ({
    balance: await coinBalance(auth.memberId),
    history: (await db.rewardEntry.findMany({ where: { memberId: auth.memberId }, orderBy: { at: 'desc' }, take: 40 })).map(toReward),
    catalog: REWARDS.map((r) => ({ ...r })),
  }));

  h.on<typeof credApi.member.redeemReward, Auth>(credApi.member.redeemReward, async ({ auth, body }) => {
    const reward = REWARDS.find((r) => r.id === body.rewardId);
    if (!reward) throw notFound('Reward');
    const balance = await coinBalance(auth.memberId);
    if (balance < reward.costCoins) throw conflict('not_enough_coins', `You need ${(reward.costCoins - balance).toLocaleString('en-IN')} more coins for this`);
    const code = `CRD-${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    await db.rewardEntry.create({
      data: { memberId: auth.memberId, kind: 'redeemed', coins: -reward.costCoins, description: `${reward.title} · ${reward.brand}`, voucherCode: code, at: await ctx.simNow() },
    });
    await ctx.audit({ memberId: auth.memberId, actor: 'member', action: 'reward.redeemed', target: reward.id, details: { coins: reward.costCoins } });
    return { balance: balance - reward.costCoins, voucherCode: code, reward: { ...reward } };
  });

  return { coinBalance };
}
