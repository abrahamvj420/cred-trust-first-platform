import { creditLine, detectSalary, evaluateSalaryVerified } from '@cred/engine';
import { conflict, notFound } from '@cred/service-kit';
import { AaPurpose, CreditTier, ecosystemApi, localUrl, type AaFiType, type PermissionScope } from '@cred/types';
import { catalog } from '@cred/db/seed';
import { randomUUID } from 'node:crypto';
import { dataUpdated, raiseAlert } from './alerts';
import type { Ctx } from './context';
import { activeRules, persistDecision } from './engine-runner';
import { toConsent, toPermission } from './mappers';

/**
 * CRED as an FIU on the Account Aggregator network. Each purpose asks for only
 * the data it needs; derived data is deleted when the consent or the matching
 * permission is withdrawn.
 */
export const PURPOSE: Record<AaPurpose, { fiTypes: AaFiType[]; months: number; scope: PermissionScope; context: string }> = {
  income_verification: { fiTypes: ['DEPOSIT'], months: 6, scope: 'income_data', context: 'Salary verification via Account Aggregator' },
  portfolio_tracking: { fiTypes: ['MUTUAL_FUNDS', 'TERM_DEPOSIT'], months: 12, scope: 'portfolio_data', context: 'Portfolio tracking via Account Aggregator' },
  protection_review: { fiTypes: ['INSURANCE_POLICIES'], months: 1, scope: 'insurance_data', context: 'Cover check via Account Aggregator' },
};
export const PURPOSE_FOR_SCOPE: Partial<Record<PermissionScope, AaPurpose>> = { income_data: 'income_verification', portfolio_data: 'portfolio_tracking', insurance_data: 'protection_review' };

const credAppUrl = () => process.env.CRED_APP_URL ?? localUrl('cred');

export async function startConsent(ctx: Ctx, memberId: string, purpose: AaPurpose, returnTo: string) {
  const member = await ctx.db.member.findUniqueOrThrow({ where: { id: memberId } });
  const p = PURPOSE[purpose];
  const row = await ctx.db.aaConsent.create({
    data: { memberId, consentHandle: `pending_${randomUUID()}`, purpose, fiTypesJson: JSON.stringify(p.fiTypes), status: 'PENDING', returnTo },
  });
  try {
    const r = await ctx.partner(ecosystemApi.aa.createConsent, {
      body: { customerAaHandle: `${member.phone}@simaa`, purpose, fiTypes: p.fiTypes, dataRangeMonths: p.months, clientRef: row.id, redirectUrl: `${credAppUrl()}/aa/return?consent=${row.id}` },
    });
    const updated = await ctx.db.aaConsent.update({ where: { id: row.id }, data: { consentHandle: r.consentHandle } });
    await ctx.audit({ memberId, actor: 'member', action: 'aa.consent_requested', target: row.id, details: { purpose, fiTypes: p.fiTypes } });
    return { consent: toConsent(updated), redirectUrl: r.approvalUrl };
  } catch (e) {
    await ctx.db.aaConsent.delete({ where: { id: row.id } });
    throw e;
  }
}

export async function onConsentUpdated(ctx: Ctx, handle: string, consentId: string | null, status: string): Promise<string | null> {
  const c = await ctx.db.aaConsent.findUnique({ where: { consentHandle: handle } });
  if (!c) return null;
  if (c.status === status) return c.memberId;
  await ctx.db.aaConsent.update({ where: { id: c.id }, data: { status, consentId, expiresAt: status === 'ACTIVE' ? new Date(Date.now() + 365 * 86_400_000) : c.expiresAt } });
  const purpose = AaPurpose.parse(c.purpose);
  if (status === 'ACTIVE') {
    // Approving at the AA is the member's explicit choice: recorded as the matching permission
    const { scope, context } = PURPOSE[purpose];
    const now = new Date();
    const perm = await ctx.db.permission.upsert({
      where: { memberId_scope: { memberId: c.memberId, scope } },
      update: { status: 'granted', grantedAt: now, withdrawnAt: null, context },
      create: { memberId: c.memberId, scope, status: 'granted', grantedAt: now, context },
    });
    await ctx.audit({ memberId: c.memberId, actor: 'member', action: 'permission.granted', target: scope, details: { context, via: 'account_aggregator', consentId } });
    ctx.hub.member(c.memberId, { type: 'permission.changed', data: { permission: toPermission(perm) } });
  }
  await ctx.audit({ memberId: c.memberId, actor: 'partner', action: `aa.consent_${status.toLowerCase()}`, target: c.id, details: { purpose } });
  dataUpdated(ctx, c.memberId, 'consent');
  return c.memberId;
}

/** Pull data under an active consent and keep only what the purpose needs. */
export async function refreshFromAa(ctx: Ctx, consentRowId: string): Promise<void> {
  const { db } = ctx;
  const c = await db.aaConsent.findUniqueOrThrow({ where: { id: consentRowId } });
  if (c.status !== 'ACTIVE' || !c.consentId) throw conflict('consent_not_active', 'Consent is not active');
  const fi = await ctx.partner(ecosystemApi.aa.fetch, { body: { consentId: c.consentId, sessionId: `ses_${randomUUID()}` } });
  const memberId = c.memberId;
  const purpose = AaPurpose.parse(c.purpose);

  if (purpose === 'income_verification') {
    const txns = fi.deposits.flatMap((d) => d.transactions);
    const finding = detectSalary(txns, activeRules());
    const member = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { ladder: true } });
    const tier = CreditTier.parse(member.ladder?.tier ?? 'starter');
    const before = creditLine(tier, null, false);
    const after = finding ? creditLine(tier, finding.monthlyNetPaise, false) : null;
    if (finding) {
      const data = { monthlyNetPaise: finding.monthlyNetPaise, employer: finding.employer, monthsVerified: finding.monthsVerified, verifiedAt: new Date(), consentId: c.consentId };
      await db.incomeProfile.upsert({ where: { memberId }, update: data, create: { memberId, ...data } });
    }
    // Raw transactions are not stored; only the result above.
    const r = evaluateSalaryVerified(finding, before, after);
    if (r.kind === 'decision') await persistDecision(ctx, memberId, r.decision, null, `salary:${c.id}`, await ctx.simDate());
    await ctx.audit({ memberId, actor: 'system', action: finding ? 'income.verified' : 'income.not_found', target: c.id, details: { monthsSeen: finding?.monthsVerified ?? 0 } });
    await db.aaConsent.update({ where: { id: c.id }, data: { lastFetchedAt: new Date() } });
    dataUpdated(ctx, memberId, 'income');
  }

  if (purpose === 'portfolio_tracking') {
    // Price per unit at the last update, to tell a market move from a sale
    const navBefore = new Map((await db.holding.findMany({ where: { memberId, source: 'aa', kind: 'mutual_fund' } })).map((h) => [`${h.externalRef}:${h.schemeCode}`, h.units ? h.valuePaise / h.units : 0]));
    let atOldPrices = 0;
    let atNewPrices = 0;
    const seen = new Set<string>();
    for (const f of fi.mutualFunds) {
      const scheme = catalog.FUND_HOUSE.schemes.find((x) => x.code === f.schemeCode);
      const key = { memberId_externalRef_schemeCode: { memberId, externalRef: f.folio, schemeCode: f.schemeCode } };
      const data = {
        kind: 'mutual_fund',
        assetClass: f.category,
        name: f.schemeName,
        provider: f.amc,
        units: f.units,
        valuePaise: Math.round(f.units * f.navPaise),
        costPaise: f.costPaise,
        acquiredAt: f.acquiredOn,
        expenseRatioBps: f.expenseRatioBps,
        expectedReturnBps: scheme?.expectedReturnBps ?? 1000,
        sourceConsentId: c.consentId,
        source: 'aa',
      };
      const h = await db.holding.upsert({ where: key, update: data, create: { memberId, externalRef: f.folio, schemeCode: f.schemeCode, ...data } });
      seen.add(h.id);
      const old = navBefore.get(`${f.folio}:${f.schemeCode}`);
      if (old) {
        atOldPrices += f.units * old;
        atNewPrices += f.units * f.navPaise;
      }
    }
    for (const t of fi.termDeposits) {
      const existing = await db.holding.findFirst({ where: { memberId, externalRef: t.fdRef } });
      const data = { kind: 'fixed_deposit', assetClass: 'fixed_deposit', name: `Fixed Deposit · matures ${t.maturesOn}`, provider: t.fipName, units: null, valuePaise: t.principalPaise, costPaise: t.principalPaise, acquiredAt: t.openedOn, expectedReturnBps: t.ratePaBps, sourceConsentId: c.consentId, source: 'aa' };
      const h = existing ? await db.holding.update({ where: { id: existing.id }, data }) : await db.holding.create({ data: { memberId, externalRef: t.fdRef, ...data } });
      seen.add(h.id);
    }
    // Holdings the member no longer has (sold, matured) drop off
    await db.holding.deleteMany({ where: { memberId, source: 'aa', id: { notIn: [...seen] } } });
    if (atOldPrices > 0 && atNewPrices < atOldPrices * 0.95) {
      const fell = Math.round(atOldPrices - atNewPrices);
      await raiseAlert(ctx, memberId, {
        kind: 'market_fall',
        title: `Markets fell: your funds are down ${Math.round((fell * 100) / atOldPrices)}%`,
        body: `They’re worth ₹${Math.round(atNewPrices / 100).toLocaleString('en-IN')} now, ₹${Math.round(fell / 100).toLocaleString('en-IN')} less than at the last update. Falls like this happen; your goal plans already allow for ups and downs. Nothing you need to do.`,
        href: '/wealth',
        sourceRef: `mf:${c.id}:${fi.fetchedAt}`,
      });
    }
    await db.aaConsent.update({ where: { id: c.id }, data: { lastFetchedAt: new Date() } });
    dataUpdated(ctx, memberId, 'holdings');
  }

  if (purpose === 'protection_review') {
    for (const p of fi.insurance) {
      const existing = await db.insurancePolicy.findUnique({ where: { externalRef: p.policyRef } });
      const data = {
        insurerName: p.insurerName,
        productName: p.productName,
        kind: p.kind,
        coverPaise: p.coverPaise,
        deductiblePaise: p.deductiblePaise,
        annualPremiumPaise: p.annualPremiumPaise,
        isEmployer: p.isEmployer,
        employerName: p.employerName,
        membersCoveredJson: JSON.stringify(p.membersCovered),
        renewalDate: p.renewalDate,
        vehicleJson: p.vehicle ? JSON.stringify(p.vehicle) : null,
      };
      if (existing) await db.insurancePolicy.update({ where: { id: existing.id }, data });
      else await db.insurancePolicy.create({ data: { memberId, externalRef: p.policyRef, source: 'aa', ...data } });
    }
    // Policies that ended (e.g. replaced) drop off, unless bought through CRED and still with the insurer
    await db.insurancePolicy.deleteMany({ where: { memberId, source: 'aa', externalRef: { notIn: fi.insurance.map((p) => p.policyRef) } } });
    await db.aaConsent.update({ where: { id: c.id }, data: { lastFetchedAt: new Date() } });
    dataUpdated(ctx, memberId, 'insurance');
  }
}

/** Revoke at the AA and delete what CRED derived from it. */
export async function revokeConsent(ctx: Ctx, memberId: string, consentRowId: string, actor: 'member' | 'system' = 'member') {
  const { db } = ctx;
  const c = await db.aaConsent.findUnique({ where: { id: consentRowId } });
  if (!c || c.memberId !== memberId) throw notFound('Consent');
  if (c.status === 'ACTIVE' || c.status === 'PENDING') {
    await ctx.partner(ecosystemApi.aa.revoke, { params: { consentHandle: c.consentHandle } }).catch((e) => ctx.log.warn({ err: String(e) }, 'AA revoke failed'));
  }
  const updated = await db.aaConsent.update({ where: { id: c.id }, data: { status: c.status === 'ACTIVE' || c.status === 'PENDING' ? 'REVOKED' : c.status } });
  const purpose = AaPurpose.parse(c.purpose);
  const deleted: string[] = [];
  if (purpose === 'income_verification') {
    if ((await db.incomeProfile.deleteMany({ where: { memberId } })).count) deleted.push('verified income');
  }
  if (purpose === 'portfolio_tracking') {
    const n = (await db.holding.deleteMany({ where: { memberId, source: 'aa', pledgedUnits: 0 } })).count;
    if (n) deleted.push(`${n} linked holdings`);
  }
  if (purpose === 'protection_review') {
    const n = (await db.insurancePolicy.deleteMany({ where: { memberId, source: 'aa' } })).count;
    if (n) deleted.push(`${n} linked policies`);
  }
  await ctx.audit({ memberId, actor, action: 'aa.consent_revoked', target: c.id, details: { purpose, deleted } });
  dataUpdated(ctx, memberId, 'consent');
  return toConsent(updated);
}
