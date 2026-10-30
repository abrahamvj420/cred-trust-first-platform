import type { WebhookEvent, WebhookEventOf } from '@cred/types';
import type { Ctx } from './context';
import { runBigSpend } from './engine-runner';
import { toLoan, toTxn } from './mappers';

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/**
 * Ingest one verified partner event. Idempotent by event id: a duplicate is
 * acknowledged and ignored. If processing fails, the receipt is removed so
 * the partner's retry is processed, not mistaken for a duplicate.
 */
export async function ingestWebhook(ctx: Ctx, event: WebhookEvent): Promise<{ received: true; duplicate: boolean }> {
  const { db, hub } = ctx;
  try {
    await db.inboundWebhook.create({
      data: { eventId: event.id, partner: event.partner, type: event.type, signatureOk: true, payloadJson: JSON.stringify(event) },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    await db.inboundWebhook.update({ where: { eventId: event.id }, data: { duplicateCount: { increment: 1 } } });
    hub.admin({ type: 'webhook.received', data: { eventId: event.id, type: event.type, signatureOk: true, duplicate: true } });
    return { received: true, duplicate: true };
  }

  try {
    const memberId = await dispatch(ctx, event);
    if (memberId) await db.inboundWebhook.update({ where: { eventId: event.id }, data: { memberId } });
  } catch (e) {
    await db.inboundWebhook.delete({ where: { eventId: event.id } }).catch(() => undefined);
    throw e;
  }
  hub.admin({ type: 'webhook.received', data: { eventId: event.id, type: event.type, signatureOk: true, duplicate: false } });
  return { received: true, duplicate: false };
}

/** Returns the member the event concerned, if any. */
async function dispatch(ctx: Ctx, event: WebhookEvent): Promise<string | null> {
  switch (event.type) {
    case 'bank.card.transaction.posted':
      return onCardTransaction(ctx, event);
    case 'lender.loan.decided':
      return onLoanDecided(ctx, event);
    case 'lender.loan.disbursed':
      return onLoanDisbursed(ctx, event);
    case 'sim.clock.advanced':
      await ctx.db.simState.upsert({ where: { id: 1 }, update: { currentDate: event.data.to }, create: { id: 1, currentDate: event.data.to } });
      return null;
    default:
      // Stored for the audit trail; handled in later milestones.
      return null;
  }
}

async function onCardTransaction(ctx: Ctx, event: WebhookEventOf<'bank.card.transaction.posted'>): Promise<string | null> {
  const { db, hub } = ctx;
  const d = event.data;
  const card = await db.card.findUnique({ where: { cardRef: d.cardRef }, include: { member: true } });
  if (!card || card.member.deletedAt) return null; // not a card CRED tracks

  const existing = await db.cardTransaction.findUnique({ where: { externalRef: d.transactionRef } });
  if (existing) return card.memberId; // same transaction re-sent under a new event id

  const [txn] = await db.$transaction([
    db.cardTransaction.create({
      data: { cardId: card.id, externalRef: d.transactionRef, merchant: d.merchant, category: d.category, amountPaise: d.amountPaise, postedAt: new Date(d.postedAt) },
    }),
    db.card.update({ where: { id: card.id }, data: { outstandingPaise: d.outstandingPaise, limitPaise: d.limitPaise } }),
  ]);
  await db.domainEvent.create({ data: { memberId: card.memberId, type: 'transaction.posted', payloadJson: JSON.stringify({ transactionId: txn.id, eventId: event.id }) } });
  const view = toTxn(txn);
  hub.member(card.memberId, { type: 'transaction.posted', data: { transaction: view } });
  hub.admin({ type: 'transaction.posted', data: { memberId: card.memberId, transaction: view } });

  // Ack the partner now; the engine runs right after.
  setImmediate(() => {
    runBigSpend(ctx, card.memberId, { transactionRef: d.transactionRef, merchant: d.merchant, amountPaise: d.amountPaise }, event.id).catch((e) =>
      ctx.log.error({ err: e, eventId: event.id }, 'engine run failed'),
    );
  });
  return card.memberId;
}

async function onLoanDecided(ctx: Ctx, event: WebhookEventOf<'lender.loan.decided'>): Promise<string | null> {
  const loan = await ctx.db.loan.findUnique({ where: { applicationRef: event.data.applicationRef } });
  if (!loan) return null;
  if (loan.status === 'applied') {
    const updated = await ctx.db.loan.update({ where: { id: loan.id }, data: { status: event.data.decision }, include: { installments: true } });
    ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(updated) } });
    await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: `loan.${event.data.decision}`, target: loan.id, details: { reason: event.data.reason } });
  }
  return loan.memberId;
}

async function onLoanDisbursed(ctx: Ctx, event: WebhookEventOf<'lender.loan.disbursed'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const loan = await db.loan.findUnique({ where: { applicationRef: d.applicationRef } });
  if (!loan) return null;
  if (loan.status !== 'disbursed') {
    await db.$transaction([
      db.emiInstallment.deleteMany({ where: { loanId: loan.id } }),
      db.emiInstallment.createMany({
        data: d.schedule.map((i) => ({ loanId: loan.id, n: i.n, dueDate: i.dueDate, amountPaise: i.amountPaise, principalPaise: i.principalPaise, interestPaise: i.interestPaise, status: i.status })),
      }),
      db.loan.update({ where: { id: loan.id }, data: { status: 'disbursed', loanRef: d.loanRef, emiPaise: d.emiPaise, ratePaBps: d.ratePaBps } }),
    ]);
  }
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: 'loan.disbursed', target: loan.id, details: { lender: loan.lenderName, principalPaise: d.principalPaise } });
  return loan.memberId;
}
