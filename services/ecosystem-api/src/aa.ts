import { conflict, handlers, HttpError, notFound } from '@cred/service-kit';
import { AaFiType, ecosystemApi, type AaPurpose, type FiData } from '@cred/types';
import { randomUUID } from 'node:crypto';
import { simDate, type Ctx } from './context';

/**
 * SimAA, the Account Aggregator. CRED (the FIU) asks; the customer approves
 * on SimAA's own page, choosing which accounts; data flows only under an
 * ACTIVE consent, for the types and accounts approved.
 */
const PURPOSE_TEXT: Record<AaPurpose, string> = {
  income_verification: 'Verify your salary to improve the credit limit and rate available to you',
  portfolio_tracking: 'Track your investments and plan goals in one place',
  protection_review: 'Check your insurance cover, including cover from your employer, for gaps',
};
const VALID_FOR: Record<AaPurpose, number> = { income_verification: 1, portfolio_tracking: 12, protection_review: 12 };

/** Linkable accounts per FI type. Funds and policies are linked per institution, so new holdings there flow too. */
async function linkable(ctx: Ctx, personId: string, fiTypes: AaFiType[]) {
  const { db } = ctx;
  const out: { accountRef: string; fipName: string; fiType: AaFiType; masked: string; label: string }[] = [];
  if (fiTypes.includes('DEPOSIT')) {
    for (const a of await db.bankAccount.findMany({ where: { personId } })) out.push({ accountRef: a.id, fipName: 'Mock Bank', fiType: 'DEPOSIT', masked: `XXXX${a.accountNo.slice(-4)}`, label: `${a.kind === 'salary' ? 'Salary' : 'Savings'} account` });
  }
  if (fiTypes.includes('TERM_DEPOSIT')) {
    for (const f of await db.fixedDeposit.findMany({ where: { personId } })) out.push({ accountRef: f.id, fipName: 'Mock Bank', fiType: 'TERM_DEPOSIT', masked: `FD ${f.id.slice(-4).toUpperCase()}`, label: `Fixed deposit, matures ${f.maturesOn}` });
  }
  if (fiTypes.includes('MUTUAL_FUNDS') && (await db.fundHolding.count({ where: { personId } }))) {
    out.push({ accountRef: 'fip:amc_meridian', fipName: 'Meridian Mutual Fund', fiType: 'MUTUAL_FUNDS', masked: 'All folios', label: 'Mutual fund holdings' });
  }
  if (fiTypes.includes('INSURANCE_POLICIES') && (await db.policy.count({ where: { personId } }))) {
    out.push({ accountRef: 'fip:ins_sahaj', fipName: 'Sahaj Health Insurance', fiType: 'INSURANCE_POLICIES', masked: 'All policies', label: 'Health and motor policies, including employer cover' });
  }
  return out;
}

export function aaHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;

  h.on(ecosystemApi.aa.createConsent, async ({ body }) => {
    const phone = body.customerAaHandle.split('@')[0]!;
    const person = await db.person.findUnique({ where: { phone } });
    if (!person) throw new HttpError(422, 'unknown_customer', 'No SimAA account for this handle');
    const c = await db.aaConsentRequest.create({
      data: {
        consentHandle: `aah_${randomUUID()}`,
        fiu: 'CRED',
        personId: person.id,
        purpose: body.purpose,
        fiTypesJson: JSON.stringify(body.fiTypes),
        dataRangeMonths: body.dataRangeMonths,
        clientRef: body.clientRef,
        redirectUrl: body.redirectUrl,
      },
    });
    return { consentHandle: c.consentHandle, status: 'PENDING' as const, approvalUrl: `${ctx.pagesUrl}/aa/consent/${c.consentHandle}` };
  });

  h.on(ecosystemApi.aa.consent, async ({ params }) => {
    const c = await db.aaConsentRequest.findUnique({ where: { consentHandle: params.consentHandle }, include: { person: true } });
    if (!c) throw notFound('Consent');
    const fiTypes = AaFiType.array().parse(JSON.parse(c.fiTypesJson));
    return {
      consentHandle: c.consentHandle,
      fiuName: c.fiu,
      purpose: c.purpose as AaPurpose,
      purposeText: PURPOSE_TEXT[c.purpose as AaPurpose],
      fiTypes,
      dataRangeMonths: c.dataRangeMonths,
      validForMonths: VALID_FOR[c.purpose as AaPurpose],
      status: c.status as 'PENDING',
      customerName: c.person.name,
      accounts: await linkable(ctx, c.personId, fiTypes),
      redirectUrl: c.redirectUrl,
      decidedAt: c.decidedAt?.toISOString() ?? null,
    };
  });

  h.on(ecosystemApi.aa.decide, async ({ params, body }) => {
    const c = await db.aaConsentRequest.findUnique({ where: { consentHandle: params.consentHandle } });
    if (!c) throw notFound('Consent');
    if (c.status !== 'PENDING') throw conflict('already_decided', `This request is already ${c.status.toLowerCase()}`);
    const fiTypes = AaFiType.array().parse(JSON.parse(c.fiTypesJson));
    const back = (status: string) => `${c.redirectUrl}${c.redirectUrl.includes('?') ? '&' : '?'}status=${status}`;
    if (body.decision === 'reject') {
      await db.aaConsentRequest.update({ where: { id: c.id }, data: { status: 'REJECTED', decidedAt: new Date() } });
      await ctx.outbox.emit('aa.consent.updated', { consentHandle: c.consentHandle, consentId: null, status: 'REJECTED', fiTypes });
      return { status: 'REJECTED' as const, redirectUrl: back('rejected') };
    }
    await approveConsent(ctx, c.consentHandle, body.accountRefs);
    return { status: 'ACTIVE' as const, redirectUrl: back('approved') };
  });

  h.on(ecosystemApi.aa.customerConsents, async ({ params }) => {
    const person = await db.person.findUnique({ where: { id: params.customerRef }, include: { aaConsents: { orderBy: { createdAt: 'desc' } } } });
    if (!person) throw notFound('Customer');
    return {
      customerName: person.name,
      handle: `${person.phone}@simaa`,
      consents: person.aaConsents.map((c) => ({
        consentHandle: c.consentHandle,
        fiuName: c.fiu,
        purposeText: PURPOSE_TEXT[c.purpose as AaPurpose],
        fiTypes: AaFiType.array().parse(JSON.parse(c.fiTypesJson)),
        status: c.status as 'ACTIVE',
        createdAt: c.createdAt.toISOString(),
        decidedAt: c.decidedAt?.toISOString() ?? null,
      })),
    };
  });

  h.on(ecosystemApi.aa.revoke, async ({ params }) => {
    const c = await db.aaConsentRequest.findUnique({ where: { consentHandle: params.consentHandle } });
    if (!c) throw notFound('Consent');
    if (c.status === 'ACTIVE' || c.status === 'PENDING') await db.aaConsentRequest.update({ where: { id: c.id }, data: { status: 'REVOKED' } });
    return { status: (c.status === 'ACTIVE' || c.status === 'PENDING' ? 'REVOKED' : c.status) as 'REVOKED' };
  });

  h.on(ecosystemApi.aa.fetch, async ({ body }) => {
    const c = await db.aaConsentRequest.findUnique({ where: { consentId: body.consentId } });
    if (!c) throw notFound('Consent');
    if (c.status !== 'ACTIVE') throw new HttpError(403, 'consent_not_active', `Consent is ${c.status}`);
    return buildFiData(ctx, c);
  });
}

/** Approve a pending request for the accounts chosen (all offered, when none are given), then tell the FIU data is ready. */
export async function approveConsent(ctx: Ctx, consentHandle: string, accountRefs?: string[]): Promise<void> {
  const { db } = ctx;
  const c = await db.aaConsentRequest.findUniqueOrThrow({ where: { consentHandle } });
  const fiTypes = AaFiType.array().parse(JSON.parse(c.fiTypesJson));
  const offered = (await linkable(ctx, c.personId, fiTypes)).map((a) => a.accountRef);
  const chosen = accountRefs ? accountRefs.filter((r) => offered.includes(r)) : offered;
  if (!chosen.length) throw new HttpError(422, 'no_accounts', 'Choose at least one account to share');
  const consentId = `aac_${randomUUID()}`;
  await db.aaConsentRequest.update({ where: { id: c.id }, data: { status: 'ACTIVE', consentId, accountRefsJson: JSON.stringify(chosen), decidedAt: new Date() } });
  await ctx.outbox.emit('aa.consent.updated', { consentHandle, consentId, status: 'ACTIVE', fiTypes });
  await ctx.outbox.emit('aa.fi.ready', { consentHandle, consentId, sessionId: `ses_${randomUUID()}` });
}

async function buildFiData(ctx: Ctx, c: { consentId: string | null; personId: string; fiTypesJson: string; accountRefsJson: string; dataRangeMonths: number }): Promise<FiData> {
  const { db } = ctx;
  const fiTypes = AaFiType.array().parse(JSON.parse(c.fiTypesJson));
  const refs = new Set(JSON.parse(c.accountRefsJson) as string[]);
  const today = await simDate(db);
  const since = new Date(Date.parse(`${today}T00:00:00+05:30`) - c.dataRangeMonths * 31 * 86_400_000);
  const data: FiData = { consentId: c.consentId!, fetchedAt: new Date().toISOString(), deposits: [], termDeposits: [], mutualFunds: [], insurance: [] };

  if (fiTypes.includes('DEPOSIT')) {
    for (const a of await db.bankAccount.findMany({ where: { personId: c.personId }, include: { txns: { where: { at: { gte: since } }, orderBy: { at: 'asc' } } } })) {
      if (!refs.has(a.id)) continue;
      data.deposits.push({
        fipName: 'Mock Bank',
        accountMasked: `XXXX${a.accountNo.slice(-4)}`,
        transactions: a.txns.map((t) => ({ date: new Date(t.at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10), amountPaise: t.amountPaise, kind: t.amountPaise >= 0 ? 'credit' : 'debit', narration: t.narration })),
      });
    }
  }
  if (fiTypes.includes('TERM_DEPOSIT')) {
    for (const f of await db.fixedDeposit.findMany({ where: { personId: c.personId } })) {
      if (refs.has(f.id)) data.termDeposits.push({ fipName: 'Mock Bank', fdRef: f.id, principalPaise: f.principalPaise, ratePaBps: f.ratePaBps, openedOn: f.openedOn, maturesOn: f.maturesOn });
    }
  }
  if (fiTypes.includes('MUTUAL_FUNDS') && refs.has('fip:amc_meridian')) {
    for (const hd of await db.fundHolding.findMany({ where: { personId: c.personId }, include: { scheme: { include: { fundHouse: true } } } })) {
      if (hd.units <= 0) continue;
      data.mutualFunds.push({
        amc: hd.scheme.fundHouse.name,
        folio: hd.folio,
        schemeCode: hd.scheme.code,
        schemeName: hd.scheme.name,
        units: hd.units,
        navPaise: hd.scheme.navPaise,
        costPaise: hd.costPaise,
        acquiredOn: hd.acquiredOn,
        expenseRatioBps: hd.scheme.expenseRatioBps,
        category: hd.scheme.category as 'equity',
      });
    }
  }
  if (fiTypes.includes('INSURANCE_POLICIES') && refs.has('fip:ins_sahaj')) {
    for (const p of await db.policy.findMany({ where: { personId: c.personId }, include: { product: { include: { insurer: true } } } })) {
      data.insurance.push({
        insurerName: p.product.insurer.name,
        policyRef: p.id,
        productName: p.product.name,
        kind: policyKindOf(p.product.kind, p.isEmployer),
        coverPaise: p.coverPaise,
        deductiblePaise: p.deductiblePaise,
        annualPremiumPaise: p.annualPremiumPaise,
        isEmployer: p.isEmployer,
        employerName: p.employerName,
        membersCovered: JSON.parse(p.membersCoveredJson),
        renewalDate: p.renewalDate,
        vehicle: p.vehicleJson ? JSON.parse(p.vehicleJson) : null,
      });
    }
  }
  return data;
}

export function policyKindOf(productKind: string, isEmployer: boolean) {
  if (isEmployer) return 'employer_group_health' as const;
  switch (productKind) {
    case 'super_top_up':
      return 'health_super_top_up' as const;
    case 'motor_third_party':
    case 'motor_own_damage':
    case 'motor_comprehensive':
      return productKind;
    default:
      return 'health_family_floater' as const;
  }
}

/** The AA tells the FIU new data is ready under each active consent of these types (e.g. NAVs moved, a new policy). */
export async function notifyFiReady(ctx: Ctx, fiType: AaFiType, personId?: string): Promise<number> {
  const consents = await ctx.db.aaConsentRequest.findMany({ where: { status: 'ACTIVE', ...(personId ? { personId } : {}) } });
  let n = 0;
  for (const c of consents) {
    if (!(JSON.parse(c.fiTypesJson) as string[]).includes(fiType) || !c.consentId) continue;
    await ctx.outbox.emit('aa.fi.ready', { consentHandle: c.consentHandle, consentId: c.consentId, sessionId: `ses_${randomUUID()}` });
    n += 1;
  }
  return n;
}
