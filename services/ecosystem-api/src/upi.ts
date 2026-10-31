import { handlers, HttpError, notFound } from '@cred/service-kit';
import { ecosystemApi } from '@cred/types';
import { simNow, type Ctx } from './context';

const MAX_PIN_ATTEMPTS = 3;
const rrn = () => String(600_000_000_000 + Math.floor(Math.random() * 99_999_999_999));

/** Mock UPI switch: payment apps initiate, the payer approves with their UPI PIN on the switch's own page. */
export function upiHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.upi.resolveVpa, async ({ params }) => {
    const v = await db.vpa.findUnique({ where: { handle: params.vpa.toLowerCase() } });
    return { vpa: params.vpa, name: v?.name ?? null, valid: !!v };
  });

  h.on(ecosystemApi.upi.initiate, async ({ body }) => {
    const payer = await db.vpa.findUnique({ where: { handle: body.payerVpa } });
    if (!payer?.accountId) throw new HttpError(422, 'invalid_payer', 'Payer UPI ID is not linked to a bank account');
    const payee = await db.vpa.findUnique({ where: { handle: body.payeeVpa.toLowerCase() } });
    if (!payee) throw new HttpError(422, 'invalid_payee', 'That UPI ID doesn’t exist');
    if (payee.handle === payer.handle) throw new HttpError(422, 'same_account', 'You can’t pay yourself');
    const txn = await db.upiTxn.create({
      data: {
        payerVpa: payer.handle,
        payeeVpa: payee.handle,
        amountPaise: body.amountPaise,
        note: body.note,
        initiatedVia: 'cred',
        clientRef: body.clientRef,
        returnUrl: body.returnUrl,
      },
    });
    return { upiTxnRef: txn.id, status: 'awaiting_pin' as const, pinUrl: `${ctx.pagesUrl}/upi/pin/${txn.id}` };
  });

  h.on(ecosystemApi.upi.challenge, async ({ params }) => {
    const t = await db.upiTxn.findUnique({ where: { id: params.upiTxnRef } });
    if (!t) throw notFound('UPI payment');
    const payer = await db.vpa.findUniqueOrThrow({ where: { handle: t.payerVpa }, include: { account: true } });
    const payee = await db.vpa.findUnique({ where: { handle: t.payeeVpa } });
    return {
      upiTxnRef: t.id,
      payerVpa: t.payerVpa,
      payerBank: `Mock Bank ··${payer.account?.accountNo.slice(-4) ?? '----'}`,
      payeeVpa: t.payeeVpa,
      payeeName: payee?.name ?? t.payeeVpa,
      amountPaise: t.amountPaise,
      note: t.note,
      status: t.status as 'awaiting_pin',
      attemptsLeft: t.attemptsLeft,
      returnUrl: t.returnUrl,
      initiatedVia: t.initiatedVia === 'cred' ? 'CRED' : t.initiatedVia,
      demoPin: payer.pin ?? '1234',
    };
  });

  h.on(ecosystemApi.upi.submitPin, async ({ params, body }) => {
    const t = await db.upiTxn.findUnique({ where: { id: params.upiTxnRef } });
    if (!t) throw notFound('UPI payment');
    const done = (status: 'success' | 'failed' | 'awaiting_pin', failureReason: string | null, attemptsLeft: number, ref: string | null) => ({
      status,
      rrn: ref,
      failureReason,
      attemptsLeft,
      returnUrl: t.returnUrl,
    });
    if (t.status !== 'awaiting_pin') return done(t.status as 'success', t.failureReason, t.attemptsLeft, t.rrn);

    const payer = await db.vpa.findUniqueOrThrow({ where: { handle: t.payerVpa }, include: { account: true } });
    const finish = async (status: 'success' | 'failed', failureReason: string | null, ref: string | null, attemptsLeft: number) => {
      await db.upiTxn.update({ where: { id: t.id }, data: { status, failureReason, rrn: ref, attemptsLeft } });
      await ctx.outbox.emit('upi.transaction.completed', {
        upiTxnRef: t.id,
        clientRef: t.clientRef,
        status,
        rrn: ref,
        failureReason,
        amountPaise: t.amountPaise,
        completedAt: new Date().toISOString(),
      });
      return done(status, failureReason, attemptsLeft, ref);
    };

    if (body.pin !== payer.pin) {
      const left = t.attemptsLeft - 1;
      if (left <= 0) return finish('failed', 'Too many incorrect UPI PIN attempts', null, 0);
      await db.upiTxn.update({ where: { id: t.id }, data: { attemptsLeft: left } });
      return done('awaiting_pin', 'Incorrect UPI PIN', left, null);
    }
    if (!payer.account || payer.account.balancePaise < t.amountPaise) {
      return finish('failed', 'Not enough balance in your bank account', null, t.attemptsLeft);
    }

    const payee = await db.vpa.findUnique({ where: { handle: t.payeeVpa } });
    const at = await simNow(db);
    const ref = rrn();
    await db.$transaction([
      db.bankAccount.update({ where: { id: payer.account.id }, data: { balancePaise: { decrement: t.amountPaise } } }),
      db.bankTxn.create({ data: { accountId: payer.account.id, kind: 'debit', amountPaise: -t.amountPaise, narration: `UPI/${ref}/${t.payeeVpa}`, at } }),
      ...(payee?.accountId
        ? [
            db.bankAccount.update({ where: { id: payee.accountId }, data: { balancePaise: { increment: t.amountPaise } } }),
            db.bankTxn.create({ data: { accountId: payee.accountId, kind: 'credit', amountPaise: t.amountPaise, narration: `UPI/${ref}/${t.payerVpa}`, at } }),
          ]
        : []),
    ]);
    return finish('success', null, ref, t.attemptsLeft);
  });
}
