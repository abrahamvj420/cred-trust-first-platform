import { billOutcome, ladderAfter, tierLabel } from '@cred/engine';
import { CreditTier, formatBps, formatInr, type WebhookEvent, type WebhookEventOf } from '@cred/types';
import { onConsentUpdated, refreshFromAa } from './aa';
import { dataUpdated, raiseAlert } from './alerts';
import type { Ctx } from './context';
import { recordLadderChange, runBigSpend, runProtectionGap } from './engine-runner';
import { shareWellnessScore } from './wellness';
import { toClaim, toLoan, toTxn } from './mappers';

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
    case 'bank.card.statement.generated':
      return onStatement(ctx, event);
    case 'bank.card.payment.received':
      return onPayment(ctx, event);
    case 'lender.loan.decided':
      return onLoanDecided(ctx, event);
    case 'lender.loan.disbursed':
      return onLoanDisbursed(ctx, event);
    case 'lender.emi.collected':
      return onEmiCollected(ctx, event);
    case 'lender.loan.repriced':
      return onRepriced(ctx, event);
    case 'lender.collateral.alert':
      return onCollateral(ctx, event);
    case 'lender.emi.bounced':
      return onEmiBounced(ctx, event);
    case 'lender.loan.prepaid':
      return onPrepaid(ctx, event);
    case 'insurer.policy.renewed':
      return onRenewed(ctx, event);
    case 'upi.transaction.completed':
      return onUpiCompleted(ctx, event);
    case 'aa.consent.updated':
      return onConsentUpdated(ctx, event.data.consentHandle, event.data.consentId, event.data.status);
    case 'aa.fi.ready':
      return onFiReady(ctx, event);
    case 'insurer.policy.renewal_due':
      return onRenewalDue(ctx, event);
    case 'insurer.policy.issued':
      return onPolicyIssued(ctx, event);
    case 'insurer.claim.updated':
      return onClaimUpdated(ctx, event);
    case 'fundhouse.redemption.completed':
      return onRedemption(ctx, event);
    case 'wearable.activity.summary':
      return onActivity(ctx, event);
    case 'sim.clock.advanced':
      await ctx.db.simState.upsert({ where: { id: 1 }, update: { currentDate: event.data.to }, create: { id: 1, currentDate: event.data.to } });
      await applyDueDates(ctx, event.data.to);
      ctx.hub.admin({ type: 'sim.advanced', data: event.data });
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
    void (async () => {
      await runBigSpend(ctx, card.memberId, { transactionRef: d.transactionRef, merchant: d.merchant, amountPaise: d.amountPaise }, event.id);
      // A new vehicle is a reason to check cover (Protection-Gap Engine)
      if (d.category === 'automobile') {
        await runProtectionGap(ctx, card.memberId, { focus: 'motor', trigger: `Your new vehicle from ${d.merchant}`, origin: 'proactive', triggerRef: d.transactionRef, triggerEventId: event.id });
      }
    })().catch((e) => ctx.log.error({ err: e, eventId: event.id }, 'engine run failed'));
  });
  return card.memberId;
}

/** Statement closed at the bank (with any interest on what was carried). */
async function onStatement(ctx: Ctx, event: WebhookEventOf<'bank.card.statement.generated'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const card = await db.card.findUnique({ where: { cardRef: d.cardRef } });
  if (!card) return null;
  if (!(await db.statement.findUnique({ where: { externalRef: d.statementRef } }))) {
    await db.$transaction([
      db.statement.create({
        data: { cardId: card.id, externalRef: d.statementRef, periodStart: d.periodStart, periodEnd: d.periodEnd, totalDuePaise: d.totalDuePaise, minDuePaise: d.minDuePaise, dueDate: d.dueDate, interestPaise: d.interestPaise, status: d.totalDuePaise === 0 ? 'paid' : 'open' },
      }),
      db.card.update({ where: { id: card.id }, data: { outstandingPaise: d.outstandingPaise } }),
    ]);
    await ctx.audit({ memberId: card.memberId, actor: 'partner', action: 'statement.generated', target: d.statementRef, details: { totalDuePaise: d.totalDuePaise, dueDate: d.dueDate, interestPaise: d.interestPaise } });
  }
  dataUpdated(ctx, card.memberId, 'cards');
  return card.memberId;
}

/** A payment CRED didn't make itself: the bank's standing instruction, or a lender clearing a switched balance. */
async function onPayment(ctx: Ctx, event: WebhookEventOf<'bank.card.payment.received'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const statement = await db.statement.findUnique({ where: { externalRef: d.statementRef }, include: { card: true } });
  if (!statement) return null;
  if (!(await db.billPayment.findUnique({ where: { externalRef: d.paymentRef } }))) {
    const remaining = statement.totalDuePaise - statement.paidPaise;
    const paid = statement.paidPaise + d.amountPaise;
    const kind = d.amountPaise >= remaining ? 'full' : d.amountPaise <= statement.minDuePaise ? 'minimum' : 'custom';
    await db.$transaction([
      db.billPayment.create({ data: { statementId: statement.id, externalRef: d.paymentRef, kind, source: null, amountPaise: d.amountPaise, paidAt: new Date(d.receivedAt), onTime: d.onTime } }),
      db.statement.update({ where: { id: statement.id }, data: { paidPaise: paid, status: paid >= statement.totalDuePaise ? 'paid' : 'partial' } }),
      db.card.update({ where: { id: statement.cardId }, data: { outstandingPaise: d.outstandingPaise } }),
    ]);
    await ctx.audit({ memberId: statement.card.memberId, actor: 'partner', action: d.paidBy === 'lender' ? 'bill.paid_by_lender' : 'bill.paid_at_bank', target: statement.id, details: { amountPaise: d.amountPaise, onTime: d.onTime } });
  }
  dataUpdated(ctx, statement.card.memberId, 'cards');
  return statement.card.memberId;
}

/**
 * The clock moved: every bill whose due date has now passed is settled. Its
 * outcome moves the Earned Credit Ladder: in full and on time adds to the
 * streak and can unlock a tier; anything else resets the streak.
 */
async function applyDueDates(ctx: Ctx, today: string): Promise<void> {
  const { db } = ctx;
  const due = await db.statement.findMany({ where: { settledOn: null, dueDate: { lt: today } }, include: { payments: true, card: true }, orderBy: { dueDate: 'asc' } });
  for (const s of due) {
    const outcome = billOutcome({ totalDuePaise: s.totalDuePaise, minDuePaise: s.minDuePaise, paidPaise: s.paidPaise, allOnTime: s.payments.every((p) => p.onTime) });
    const status = s.paidPaise >= s.totalDuePaise ? 'paid' : s.paidPaise >= s.minDuePaise ? 'partial' : 'overdue';
    await db.statement.update({ where: { id: s.id }, data: { settledOn: today, ladderOutcome: outcome, status } });
    const memberId = s.card.memberId;
    const cur = await db.ladderProgress.findUnique({ where: { memberId } });
    const prev = { tier: CreditTier.parse(cur?.tier ?? 'starter'), onTimeStreak: cur?.onTimeStreak ?? 0 };
    const step = ladderAfter(prev, outcome);
    await db.ladderProgress.upsert({ where: { memberId }, update: { tier: step.tier, onTimeStreak: step.onTimeStreak }, create: { memberId, tier: step.tier, onTimeStreak: step.onTimeStreak } });
    await ctx.audit({ memberId, actor: 'system', action: 'ladder.updated', target: s.id, details: { outcome, from: prev, to: { tier: step.tier, onTimeStreak: step.onTimeStreak } } });
    const r = await recordLadderChange(ctx, memberId, prev, step, `ladder:${s.externalRef}`);
    if (step.change === 'up' && r?.decision.outcome === 'available') {
      await raiseAlert(ctx, memberId, { kind: 'ladder', title: `${tierLabel(step.tier)} unlocked`, body: r.decision.explanation, href: '/credit', sourceRef: `ladder:${s.externalRef}` });
    }
    dataUpdated(ctx, memberId, 'ladder');
  }
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
    // Loan against holdings: the pledged units can't be sold until it's repaid
    if (loan.collateralJson) {
      const c = JSON.parse(loan.collateralJson) as { holdingId: string; units: number | null };
      const h = await db.holding.findUnique({ where: { id: c.holdingId } });
      if (h) await db.holding.update({ where: { id: h.id }, data: { pledgedUnits: h.pledgedUnits + (c.units ?? h.units ?? 0) } });
      dataUpdated(ctx, loan.memberId, 'holdings');
    }
  }
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: 'loan.disbursed', target: loan.id, details: { lender: loan.lenderName, principalPaise: d.principalPaise, kind: d.kind } });
  return loan.memberId;
}

async function onEmiCollected(ctx: Ctx, event: WebhookEventOf<'lender.emi.collected'>): Promise<string | null> {
  const { db } = ctx;
  const loan = await db.loan.findUnique({ where: { loanRef: event.data.loanRef } });
  if (!loan) return null;
  // Collected, on time or late (a bounced EMI paid later): it's paid
  await db.emiInstallment.updateMany({ where: { loanId: loan.id, n: event.data.n }, data: { status: 'paid' } });
  const all = await db.emiInstallment.findMany({ where: { loanId: loan.id } });
  if (all.every((i) => i.status === 'paid')) {
    await db.loan.update({ where: { id: loan.id }, data: { status: 'closed' } });
    if (loan.collateralJson) {
      const c = JSON.parse(loan.collateralJson) as { holdingId: string; units: number | null };
      const h = await db.holding.findUnique({ where: { id: c.holdingId } });
      if (h) await db.holding.update({ where: { id: h.id }, data: { pledgedUnits: Math.max(0, h.pledgedUnits - (c.units ?? 0)) } });
    }
  }
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  return loan.memberId;
}

/** Card-Balance Switch: on-time EMIs stepped the rate down; the remaining instalments are re-priced. */
async function onRepriced(ctx: Ctx, event: WebhookEventOf<'lender.loan.repriced'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const loan = await db.loan.findUnique({ where: { loanRef: d.loanRef } });
  if (!loan) return null;
  const before = loan.ratePaBps;
  await db.$transaction([
    db.emiInstallment.deleteMany({ where: { loanId: loan.id, n: { in: d.remaining.map((i) => i.n) } } }),
    db.emiInstallment.createMany({ data: d.remaining.map((i) => ({ loanId: loan.id, n: i.n, dueDate: i.dueDate, amountPaise: i.amountPaise, principalPaise: i.principalPaise, interestPaise: i.interestPaise, status: 'upcoming' })) }),
    db.loan.update({ where: { id: loan.id }, data: { ratePaBps: d.ratePaBps, emiPaise: d.remaining[0]?.amountPaise ?? loan.emiPaise } }),
  ]);
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: 'loan.repriced', target: loan.id, details: { from: before, to: d.ratePaBps, afterOnTimePayments: d.afterOnTimePayments } });
  await raiseAlert(ctx, loan.memberId, {
    kind: 'loan',
    title: `Your EMI rate dropped to ${formatBps(d.ratePaBps)}`,
    body: `${d.afterOnTimePayments} on-time EMIs in a row moved your ${loan.lenderName} rate from ${formatBps(before)} to ${formatBps(d.ratePaBps)}. Your next EMI is ${formatInr(d.remaining[0]?.amountPaise ?? loan.emiPaise)}.`,
    href: `/loans/${loan.id}`,
    sourceRef: event.id,
  });
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  return loan.memberId;
}

/** Loan against holdings after a market move: supportive, specific, never alarming. */
async function onCollateral(ctx: Ctx, event: WebhookEventOf<'lender.collateral.alert'>): Promise<string | null> {
  const loan = await ctx.db.loan.findUnique({ where: { loanRef: event.data.loanRef } });
  if (!loan) return null;
  const d = event.data;
  const share = `${Math.round(d.loanToValueBps / 100)}%`;
  const limit = `${Math.round(d.maxLoanToValueBps / 100)}%`;
  await raiseAlert(ctx, loan.memberId, {
    kind: 'collateral',
    title: d.topUpNeededPaise > 0 ? `Your loan is now ${share} of your pledged holdings` : `Markets moved: your loan is ${share} of your pledged holdings`,
    body:
      d.topUpNeededPaise > 0
        ? `Your pledged holdings are worth ${formatInr(d.collateralValuePaise)} after the fall, and ${loan.lenderName} lends up to ${limit} of that. Repaying ${formatInr(d.topUpNeededPaise)} early, or pledging a little more, brings it back within the limit. We can help you choose.`
        : `Your pledged holdings are worth ${formatInr(d.collateralValuePaise)} now. That’s still within ${loan.lenderName}’s ${limit} limit, so there’s nothing you need to do.`,
    href: `/loans/${loan.id}`,
    sourceRef: event.id,
  });
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: 'loan.collateral_alert', target: loan.id, details: { loanToValueBps: d.loanToValueBps, topUpNeededPaise: d.topUpNeededPaise } });
  return loan.memberId;
}

/** UPI made from the CRED app: the switch reports the outcome; CRED sees it directly. */
async function onUpiCompleted(ctx: Ctx, event: WebhookEventOf<'upi.transaction.completed'>): Promise<string | null> {
  const row = await ctx.db.upiTransaction.findUnique({ where: { id: event.data.clientRef } });
  if (!row) return null;
  if (row.status === 'awaiting_pin') {
    const updated = await ctx.db.upiTransaction.update({
      where: { id: row.id },
      data: { status: event.data.status, rrn: event.data.rrn, failureReason: event.data.failureReason },
    });
    ctx.hub.member(row.memberId, { type: 'upi.updated', data: { paymentId: row.id, status: updated.status } });
    await ctx.audit({ memberId: row.memberId, actor: 'partner', action: `upi.${event.data.status}`, target: row.id, details: { amountPaise: row.amountPaise, rrn: event.data.rrn } });
  }
  return row.memberId;
}

/** New data under an active consent: pull it (a consented fetch). */
async function onFiReady(ctx: Ctx, event: WebhookEventOf<'aa.fi.ready'>): Promise<string | null> {
  const c = await ctx.db.aaConsent.findUnique({ where: { consentHandle: event.data.consentHandle } });
  if (!c) return null;
  if (c.status !== 'ACTIVE') await ctx.db.aaConsent.update({ where: { id: c.id }, data: { status: 'ACTIVE', consentId: event.data.consentId } });
  await refreshFromAa(ctx, c.id);
  return c.memberId;
}

/** Renewal coming up: remind the member (with any wellness reward), and check their cover is still right. */
async function onRenewalDue(ctx: Ctx, event: WebhookEventOf<'insurer.policy.renewal_due'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const policy = await db.insurancePolicy.findUnique({ where: { externalRef: d.policyRef } });
  if (!policy) return null;
  const memberId = policy.memberId;
  await raiseAlert(ctx, memberId, {
    kind: 'renewal',
    title: `${policy.productName} renews on ${new Date(`${d.renewalDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`,
    body:
      (d.wellnessDiscountPaise > 0
        ? `Renewal premium ${formatInr(d.renewalPremiumPaise)}: ${formatInr(d.basePremiumPaise)} less a wellness reward of ${formatInr(d.wellnessDiscountPaise)} for your activity score of ${d.wellnessScore}.`
        : `Renewal premium ${formatInr(d.renewalPremiumPaise)}.`) +
      ' We’ve checked whether your cover still fits your family.',
    href: '/protect',
    sourceRef: event.id,
  });
  setImmediate(() => {
    runProtectionGap(ctx, memberId, { focus: 'health', trigger: 'Your policy renewal', origin: 'proactive', triggerRef: `renewal:${d.policyRef}:${d.renewalDate}`, triggerEventId: event.id }).catch((e) =>
      ctx.log.error({ err: e, eventId: event.id }, 'gap check failed'),
    );
  });
  return memberId;
}

/** A policy bought through CRED is issued (clientRef = the offer). */
async function onPolicyIssued(ctx: Ctx, event: WebhookEventOf<'insurer.policy.issued'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const offer = d.clientRef ? await db.offer.findUnique({ where: { id: d.clientRef } }) : null;
  if (!offer) return null;
  const memberId = offer.memberId;
  const context = JSON.parse(offer.contextJson) as { proposal?: { option: string; replaces: string | null } };
  if (!(await db.insurancePolicy.findUnique({ where: { externalRef: d.policyRef } }))) {
    await db.insurancePolicy.create({
      data: {
        memberId,
        externalRef: d.policyRef,
        insurerName: d.insurerName,
        productName: d.productName,
        kind: d.kind,
        coverPaise: d.coverPaise,
        deductiblePaise: d.deductiblePaise,
        annualPremiumPaise: d.annualPremiumPaise,
        isEmployer: false,
        membersCoveredJson: JSON.stringify(d.membersCovered),
        renewalDate: d.renewalDate,
        source: 'cred_purchase',
        vehicleJson: d.vehicle ? JSON.stringify(d.vehicle) : null,
        offerId: offer.id,
      },
    });
    if (context.proposal?.replaces) await db.insurancePolicy.deleteMany({ where: { memberId, externalRef: context.proposal.replaces } });
    await ctx.audit({ memberId, actor: 'partner', action: 'policy.issued', target: d.policyRef, details: { product: d.productName, coverPaise: d.coverPaise, premiumPaise: d.annualPremiumPaise } });
    await raiseAlert(ctx, memberId, { kind: 'policy', title: `${d.productName} is active`, body: `Cover of ${formatInr(d.coverPaise)} from ${d.insurerName}, ${formatInr(d.annualPremiumPaise)} a year. Your policy documents are with the insurer.`, href: '/protect', sourceRef: event.id });
  }
  dataUpdated(ctx, memberId, 'insurance');
  return memberId;
}

async function onClaimUpdated(ctx: Ctx, event: WebhookEventOf<'insurer.claim.updated'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const claim = await db.claim.findUnique({ where: { externalRef: d.claimRef }, include: { policy: true } });
  if (!claim) return null;
  const timeline = JSON.parse(claim.timelineJson) as { status: string; at: string; note: string }[];
  if (!timeline.some((t) => t.status === d.status && t.at === d.at)) {
    timeline.push({ status: d.status, at: d.at, note: d.note });
    const updated = await db.claim.update({ where: { id: claim.id }, data: { status: d.status, timelineJson: JSON.stringify(timeline) }, include: { policy: true } });
    const view = toClaim(updated);
    ctx.hub.member(claim.policy.memberId, { type: 'claim.updated', data: { claim: view } });
    await raiseAlert(ctx, claim.policy.memberId, { kind: 'claim', title: `Claim update: ${d.status.replace('_', ' ')}`, body: `${d.note} ${view.nextStep}`, href: `/protect/claims/${claim.id}`, sourceRef: event.id });
    await ctx.audit({ memberId: claim.policy.memberId, actor: 'partner', action: 'claim.updated', target: claim.id, details: { status: d.status } });
  }
  return claim.policy.memberId;
}

/** The fund house confirms a sale the member asked for. */
async function onRedemption(ctx: Ctx, event: WebhookEventOf<'fundhouse.redemption.completed'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const intent = await db.sellIntent.findUnique({ where: { id: d.clientRef }, include: { holding: true } });
  if (!intent) return null;
  if (intent.status !== 'sold') {
    const h = intent.holding;
    const units = Math.max(0, (h.units ?? 0) - d.units);
    const share = h.units ? units / h.units : 0;
    await db.$transaction([
      db.sellIntent.update({ where: { id: intent.id }, data: { status: 'sold', redemptionRef: d.redemptionRef } }),
      db.holding.update({ where: { id: h.id }, data: { units, valuePaise: Math.round(h.valuePaise * share), costPaise: Math.round(h.costPaise * share) } }),
    ]);
    await ctx.audit({ memberId: intent.memberId, actor: 'partner', action: 'holding.sold', target: h.id, details: { amountPaise: d.amountPaise, units: d.units } });
  }
  dataUpdated(ctx, intent.memberId, 'holdings');
  return intent.memberId;
}

/** A weekly summary from the member's health app. Raw steps never reach CRED. */
async function onActivity(ctx: Ctx, event: WebhookEventOf<'wearable.activity.summary'>): Promise<string | null> {
  const { db } = ctx;
  const link = await db.wearableLink.findUnique({ where: { memberId: event.data.clientRef } });
  if (!link) return null; // sharing was turned off
  const s = event.data.summary;
  await db.activitySummary.upsert({
    where: { memberId_weekStart: { memberId: link.memberId, weekStart: s.weekStart } },
    update: { avgDailySteps: s.avgDailySteps, activeDays: s.activeDays, score: s.score },
    create: { memberId: link.memberId, ...s },
  });
  await shareWellnessScore(ctx, link.memberId);
  dataUpdated(ctx, link.memberId, 'wellness');
  return link.memberId;
}

/** An EMI bounced (not enough in the account). Supportive: what happened and what to do. */
async function onEmiBounced(ctx: Ctx, event: WebhookEventOf<'lender.emi.bounced'>): Promise<string | null> {
  const { db } = ctx;
  const loan = await db.loan.findUnique({ where: { loanRef: event.data.loanRef } });
  if (!loan) return null;
  await db.emiInstallment.updateMany({ where: { loanId: loan.id, n: event.data.n }, data: { status: 'overdue' } });
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: 'loan.emi_bounced', target: loan.id, details: { n: event.data.n, amountPaise: event.data.amountPaise, simDate: await ctx.simDate() } });
  await raiseAlert(ctx, loan.memberId, {
    kind: 'loan',
    title: `Your ${loan.lenderName} EMI couldn’t be collected`,
    body: `There wasn’t enough in your account for EMI ${event.data.n} of ${formatInr(event.data.amountPaise)}. You can pay it now from the loan screen, or ${loan.lenderName} will try again at the next EMI date. If money is tight, talk to us: we’ll help you plan.`,
    href: `/loans/${loan.id}`,
    sourceRef: event.id,
  });
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  return loan.memberId;
}

/** The lender confirmed an early repayment: replace what's left of the schedule, record the interest saved. */
async function onPrepaid(ctx: Ctx, event: WebhookEventOf<'lender.loan.prepaid'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const loan = await db.loan.findUnique({ where: { loanRef: d.loanRef } });
  if (!loan) return null;
  await db.$transaction([
    db.emiInstallment.deleteMany({ where: { loanId: loan.id, status: { not: 'paid' } } }),
    db.emiInstallment.createMany({ data: d.remaining.map((i) => ({ loanId: loan.id, n: i.n, dueDate: i.dueDate, amountPaise: i.amountPaise, principalPaise: i.principalPaise, interestPaise: i.interestPaise, status: 'upcoming' })) }),
    db.loan.update({
      where: { id: loan.id },
      data: { status: d.closed ? 'closed' : loan.status, interestSavedPaise: { increment: d.interestSavedPaise }, ...(d.remaining[0] ? { emiPaise: d.remaining[0].amountPaise } : {}) },
    }),
  ]);
  if (d.closed && loan.collateralJson) {
    const c = JSON.parse(loan.collateralJson) as { holdingId: string; units: number | null };
    const h = await db.holding.findUnique({ where: { id: c.holdingId } });
    if (h) await db.holding.update({ where: { id: h.id }, data: { pledgedUnits: Math.max(0, h.pledgedUnits - (c.units ?? 0)) } });
    dataUpdated(ctx, loan.memberId, 'holdings');
  }
  await ctx.audit({ memberId: loan.memberId, actor: 'partner', action: d.closed ? 'loan.closed_early' : 'loan.part_prepaid', target: loan.id, details: { amountPaise: d.amountPaise, interestSavedPaise: d.interestSavedPaise, chargesPaise: d.chargesPaise } });
  await raiseAlert(ctx, loan.memberId, {
    kind: 'loan',
    title: d.closed ? `Your ${loan.lenderName} loan is fully repaid` : `${formatInr(d.amountPaise)} repaid early`,
    body: `${loan.lenderName} confirmed your payment of ${formatInr(d.amountPaise)}. You save ${formatInr(d.interestSavedPaise)} in interest${d.closed ? '.' : `, and your last EMI is now ${d.remaining.at(-1)?.dueDate ?? ''}.`}`,
    href: `/loans/${loan.id}`,
    sourceRef: event.id,
  });
  const full = await db.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { installments: true } });
  ctx.hub.member(loan.memberId, { type: 'loan.updated', data: { loan: toLoan(full) } });
  return loan.memberId;
}

/** The insurer renewed a policy; any wellness discount it applied is the member's saving. */
async function onRenewed(ctx: Ctx, event: WebhookEventOf<'insurer.policy.renewed'>): Promise<string | null> {
  const { db } = ctx;
  const d = event.data;
  const policy = await db.insurancePolicy.findUnique({ where: { externalRef: d.policyRef } });
  if (!policy) return null;
  if (policy.lastRenewedOn !== d.renewedOn) {
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { renewalDate: d.nextRenewalDate, lastRenewedOn: d.renewedOn, lastPremiumPaidPaise: d.premiumPaidPaise, wellnessSavedPaise: { increment: d.wellnessDiscountPaise } },
    });
    await ctx.audit({ memberId: policy.memberId, actor: 'partner', action: 'policy.renewed', target: policy.id, details: { premiumPaidPaise: d.premiumPaidPaise, wellnessDiscountPaise: d.wellnessDiscountPaise } });
    await raiseAlert(ctx, policy.memberId, {
      kind: 'renewal',
      title: `${policy.productName} renewed`,
      body:
        `${formatInr(d.premiumPaidPaise)} paid for another year.` +
        (d.wellnessDiscountPaise > 0 ? ` Your activity saved you ${formatInr(d.wellnessDiscountPaise)} on the premium.` : ''),
      href: '/protect/wellness',
      sourceRef: event.id,
    });
  }
  dataUpdated(ctx, policy.memberId, 'wellness');
  return policy.memberId;
}
