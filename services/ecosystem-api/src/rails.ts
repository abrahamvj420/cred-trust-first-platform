import { conflict, handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi, localUrl, TxnCategory, type GatewayPayment } from '@cred/types';
import { demoCode, maskPhone, simNow, type Ctx } from './context';

type GatewayRow = { id: string; orderId: string; amountPaise: number; method: string; status: string; failureReason: string | null; createdAt: Date };

const toPayment = (p: GatewayRow): GatewayPayment => ({
  paymentId: p.id,
  orderId: p.orderId,
  amountPaise: p.amountPaise,
  method: p.method as GatewayPayment['method'],
  status: p.status as GatewayPayment['status'],
  failureReason: p.failureReason,
  createdAt: p.createdAt.toISOString(),
});

const withParam = (url: string, key: string, value: string) => `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

/** /gateway (ShopKart's payment gateway) and /bank (Mock Bank: card issuer). */
export function railsHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.gateway.savedCards, async ({ params }) => {
    const person = await db.person.findUnique({ where: { phone: params.shopperPhone }, include: { cardAccounts: true } });
    return {
      cards: (person?.cardAccounts ?? []).map((c) => ({ token: c.token, last4: c.last4, network: c.network as 'visa', issuerName: c.bankName })),
    };
  });

  h.on(ecosystemApi.gateway.createPayment, async ({ body, auth }) => {
    const { merchantId } = auth as { merchantId: string };
    if (await db.gatewayPayment.findUnique({ where: { merchantId_orderId: { merchantId, orderId: body.orderId } } })) {
      throw conflict('duplicate_order', `Order ${body.orderId} already has a payment`);
    }
    if (body.instrument.method !== 'card') throw new HttpError(501, 'not_implemented', 'UPI checkout arrives in M4');

    const card = await db.creditCardAccount.findUnique({ where: { token: body.instrument.cardToken }, include: { person: true } });
    if (!card || card.person.phone !== body.shopperPhone) throw new HttpError(400, 'invalid_card', 'Card not found for this shopper');
    const merchant = await db.merchant.findUniqueOrThrow({ where: { id: merchantId } });

    const base = { merchantId, orderId: body.orderId, amountPaise: body.amountPaise, description: body.description, method: 'card', returnUrl: body.returnUrl, shopperPhone: body.shopperPhone, cardAccountId: card.id };
    if (body.amountPaise > card.limitPaise - card.outstandingPaise) {
      const failed = await db.gatewayPayment.create({ data: { ...base, status: 'failed', failureReason: 'Declined by bank: insufficient credit limit' } });
      return { payment: toPayment(failed), nextAction: null };
    }
    const payment = await db.gatewayPayment.create({ data: { ...base, status: 'requires_authentication' } });
    const authRow = await db.cardAuth.create({
      data: { cardAccountId: card.id, gatewayPaymentId: payment.id, merchantName: merchant.name, amountPaise: body.amountPaise, otp: demoCode() },
    });
    return { payment: toPayment(payment), nextAction: { type: 'redirect' as const, url: `${ctx.pagesUrl}/bank/otp/${authRow.id}` } };
  });

  h.on(ecosystemApi.gateway.payment, async ({ params, auth }) => {
    const p = await db.gatewayPayment.findUnique({ where: { id: params.paymentId } });
    if (!p || p.merchantId !== (auth as { merchantId: string }).merchantId) throw notFound('Payment');
    return { payment: toPayment(p) };
  });

  h.on(ecosystemApi.bank.cardAuth, async ({ params }) => {
    const a = await db.cardAuth.findUnique({ where: { id: params.authId }, include: { card: { include: { person: true } } } });
    if (!a) throw notFound('Authentication');
    return {
      authId: a.id,
      bankName: a.card.bankName,
      merchantName: a.merchantName,
      amountPaise: a.amountPaise,
      cardMasked: `XXXX XXXX XXXX ${a.card.last4}`,
      phoneMasked: maskPhone(a.card.person.phone),
      status: a.status as 'pending',
      attemptsLeft: a.attemptsLeft,
      demoOtp: a.otp,
    };
  });

  /** Demo: any 6 digits are accepted. Approval posts the charge and tells CRED by webhook. */
  h.on(ecosystemApi.bank.submitOtp, async ({ params }) => {
    const a = await db.cardAuth.findUnique({ where: { id: params.authId }, include: { card: { include: { person: true } } } });
    if (!a) throw notFound('Authentication');
    const payment = await db.gatewayPayment.findUniqueOrThrow({ where: { id: a.gatewayPaymentId }, include: { merchant: true } });
    const returnUrl = withParam(payment.returnUrl, 'paymentId', payment.id);
    if (a.status !== 'pending') return { status: a.status as 'approved', attemptsLeft: a.attemptsLeft, returnUrl };

    const card = a.card;
    if (a.amountPaise > card.limitPaise - card.outstandingPaise) {
      await db.cardAuth.update({ where: { id: a.id }, data: { status: 'failed' } });
      await db.gatewayPayment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: 'Declined by bank: insufficient credit limit' } });
      return { status: 'failed' as const, attemptsLeft: a.attemptsLeft, returnUrl };
    }

    const postedAt = await simNow(db);
    const category = TxnCategory.catch('shopping').parse(payment.merchant.category);
    const [, , charge, updatedCard] = await db.$transaction([
      db.cardAuth.update({ where: { id: a.id }, data: { status: 'approved' } }),
      db.gatewayPayment.update({ where: { id: payment.id }, data: { status: 'succeeded' } }),
      db.cardCharge.create({ data: { cardAccountId: card.id, merchant: payment.merchant.name, category, amountPaise: a.amountPaise, postedAt } }),
      db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: { increment: a.amountPaise } } }),
    ]);

    await ctx.outbox.emit('bank.card.transaction.posted', {
      customerRef: card.personId,
      cardRef: card.id,
      transactionRef: charge.id,
      merchant: charge.merchant,
      category,
      amountPaise: charge.amountPaise,
      postedAt: postedAt.toISOString(),
      outstandingPaise: updatedCard.outstandingPaise,
      limitPaise: updatedCard.limitPaise,
    });
    return { status: 'approved' as const, attemptsLeft: a.attemptsLeft, returnUrl };
  });
}

/** Card bill payment collected by a payment app (CRED) from the member's own Mock Bank account. */
export function billPayHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;
  h.on(ecosystemApi.bank.payCardBill, async ({ body }) => {
    const card = await db.creditCardAccount.findUnique({ where: { id: body.cardRef } });
    const statement = await db.cardStatement.findUnique({ where: { id: body.statementRef } });
    if (!card || !statement || statement.cardAccountId !== card.id) throw notFound('Card statement');
    if (body.amountPaise > card.outstandingPaise) throw new HttpError(422, 'overpayment', 'That’s more than the card balance.');
    const account = await db.bankAccount.findFirst({ where: { personId: card.personId } });
    if (!account || account.balancePaise < body.amountPaise) {
      throw new HttpError(422, 'insufficient_funds', 'Your Mock Bank account doesn’t have enough balance for this payment.');
    }
    const receivedAt = await simNow(db);
    const onTime = receivedAt.toISOString().slice(0, 10) <= statement.dueDate;
    const [payment, updatedStatement, updatedCard] = await db.$transaction([
      db.cardPayment.create({ data: { statementId: statement.id, amountPaise: body.amountPaise, receivedAt, onTime, clientRef: body.clientRef } }),
      db.cardStatement.update({ where: { id: statement.id }, data: { paidPaise: { increment: body.amountPaise } } }),
      db.creditCardAccount.update({ where: { id: card.id }, data: { outstandingPaise: { decrement: body.amountPaise } } }),
      db.bankAccount.update({ where: { id: account.id }, data: { balancePaise: { decrement: body.amountPaise } } }),
      db.bankTxn.create({
        data: { accountId: account.id, kind: 'card_payment', amountPaise: -body.amountPaise, narration: `CARD BILL ${body.source === 'upi' ? 'UPI' : 'NETBANKING'} XX${card.last4}`, at: receivedAt },
      }),
    ]);
    return {
      paymentRef: payment.id,
      status: 'received' as const,
      onTime,
      receivedAt: receivedAt.toISOString(),
      statementPaidPaise: updatedStatement.paidPaise,
      outstandingPaise: updatedCard.outstandingPaise,
    };
  });
}

export const ecosystemPagesUrl = () => process.env.ECOSYSTEM_APP_URL ?? localUrl('ecosystem');
