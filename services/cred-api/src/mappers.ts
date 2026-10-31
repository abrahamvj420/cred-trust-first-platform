import type { AuditLog, CardTransaction as TxnRow, EngineDecision as DecisionRow, HelpPlan as HelpRow, Loan as LoanRow, EmiInstallment as InstRow, Offer as OfferRow, Permission as PermRow, Card as CardRow, Statement as StatementRow, BillPayment as PayRow, UpiTransaction as UpiRow, RewardEntry as RewardRow } from '@cred/db/cred';
import {
  AuditEntry,
  Card,
  CardTransaction,
  EngineDecision,
  HelpPlan,
  Loan,
  Offer,
  Permission,
  Statement,
  BillPayment,
  UpiPayment,
  RewardEntry,
} from '@cred/types';

const iso = (d: Date) => d.toISOString();
const json = <T>(s: string | null): T => (s ? JSON.parse(s) : null) as T;

export const toAudit = (r: AuditLog): AuditEntry =>
  AuditEntry.parse({ id: r.id, memberId: r.memberId, actor: r.actor, action: r.action, target: r.target, details: json(r.detailsJson) ?? {}, at: iso(r.at) });

/** Card with its latest statement (what's due) and utilisation. */
export const toCard = (c: CardRow, latest?: StatementRow | null): Card =>
  Card.parse({
    utilisationBps: c.limitPaise > 0 ? Math.round((c.outstandingPaise * 10_000) / c.limitPaise) : 0,
    nextDue: latest
      ? {
          statementId: latest.id,
          totalDuePaise: latest.totalDuePaise,
          minDuePaise: latest.minDuePaise,
          paidPaise: latest.paidPaise,
          remainingPaise: Math.max(0, latest.totalDuePaise - latest.paidPaise),
          dueDate: latest.dueDate,
          status: latest.status,
        }
      : null,
    id: c.id,
    issuerName: c.issuerName,
    network: c.network,
    last4: c.last4,
    limitPaise: c.limitPaise,
    outstandingPaise: c.outstandingPaise,
    availablePaise: Math.max(0, c.limitPaise - c.outstandingPaise),
    billingDay: c.billingDay,
    dueDay: c.dueDay,
  });

export const toTxn = (t: TxnRow): CardTransaction =>
  CardTransaction.parse({ id: t.id, cardId: t.cardId, merchant: t.merchant, category: t.category, amountPaise: t.amountPaise, postedAt: iso(t.postedAt) });

export const toStatement = (s: StatementRow): Statement =>
  Statement.parse({ id: s.id, cardId: s.cardId, periodStart: s.periodStart, periodEnd: s.periodEnd, totalDuePaise: s.totalDuePaise, minDuePaise: s.minDuePaise, paidPaise: s.paidPaise, dueDate: s.dueDate, status: s.status });

export const toPayment = (p: PayRow): BillPayment =>
  BillPayment.parse({ id: p.id, statementId: p.statementId, kind: p.kind, source: p.source, amountPaise: p.amountPaise, paidAt: iso(p.paidAt), onTime: p.onTime });

export const toUpi = (u: UpiRow): UpiPayment =>
  UpiPayment.parse({
    id: u.id,
    payerVpa: u.payerVpa,
    payeeVpa: u.payeeVpa,
    payeeName: u.payeeName,
    amountPaise: u.amountPaise,
    note: u.note,
    status: u.status,
    rrn: u.rrn,
    failureReason: u.failureReason,
    createdAt: iso(u.createdAt),
  });

export const toReward = (r: RewardRow): RewardEntry =>
  RewardEntry.parse({ id: r.id, kind: r.kind, coins: r.coins, description: r.description, at: iso(r.at) });

export const toPermission = (p: PermRow): Permission =>
  Permission.parse({ scope: p.scope, status: p.status, grantedAt: p.grantedAt && iso(p.grantedAt), withdrawnAt: p.withdrawnAt && iso(p.withdrawnAt), context: p.context });

export const toOffer = (o: OfferRow): Offer =>
  Offer.parse({
    id: o.id,
    feature: o.feature,
    status: o.status,
    origin: o.origin,
    headline: o.headline,
    subline: o.subline,
    netBenefitPaise: o.netBenefitPaise,
    comparison: json(o.comparisonJson),
    options: json(o.optionsJson),
    terms: json(o.termsJson),
    trigger: json(o.triggerJson),
    why: o.why,
    createdAt: iso(o.createdAt),
    decidedAt: o.decidedAt && iso(o.decidedAt),
  });

export const toDecision = (d: DecisionRow & { offer?: { id: string } | null }): EngineDecision =>
  EngineDecision.parse({
    id: d.id,
    memberId: d.memberId,
    feature: d.feature,
    origin: d.origin,
    triggerEventId: d.triggerEventId,
    outcome: d.outcome,
    reasons: json(d.reasonsJson),
    checks: json(d.checksJson),
    stressSignals: json(d.stressJson),
    netBenefitPaise: d.netBenefitPaise,
    offerId: d.offer?.id ?? null,
    explanation: d.explanation,
    createdAt: iso(d.createdAt),
  });

export const toHelp = (h: HelpRow): HelpPlan =>
  HelpPlan.parse({ id: h.id, kind: h.kind, title: h.title, body: h.body, monthlyInterestPaise: h.monthlyInterestPaise, createdAt: iso(h.createdAt) });

export const toLoan = (l: LoanRow & { installments: InstRow[] }): Loan =>
  Loan.parse({
    id: l.id,
    offerId: l.offerId,
    kind: l.kind,
    lenderName: l.lenderName,
    principalPaise: l.principalPaise,
    ratePaBps: l.ratePaBps,
    tenureMonths: l.tenureMonths,
    emiPaise: l.emiPaise,
    status: l.status,
    createdAt: iso(l.createdAt),
    schedule: [...l.installments]
      .sort((a, b) => a.n - b.n)
      .map((i) => ({ n: i.n, dueDate: i.dueDate, amountPaise: i.amountPaise, principalPaise: i.principalPaise, interestPaise: i.interestPaise, status: i.status })),
  });
