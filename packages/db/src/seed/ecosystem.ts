import { SIM_START_DATE } from '@cred/types';
import type { EcosystemDb } from '../ecosystem';
import { BANK, FUND_HOUSE, GOLD_PRICE_PER_GRAM_PAISE, INSURER, LENDERS, OTHER_VPAS, SHOPKART } from './catalog';
import { wipeAllTables } from './reset';
import { at } from './util';
import { summariseActivityWeek } from './wearable';
import type { PersonaWorld } from './world';

export const DEMO_UPI_PIN = '1234';

export async function seedEcosystem(db: EcosystemDb, worlds: PersonaWorld[]): Promise<void> {
  await wipeAllTables(db);

  await db.simClock.create({ data: { id: 1, currentDate: SIM_START_DATE } });
  await db.merchant.create({
    data: { id: 'mer_shopkart', name: SHOPKART.name, category: SHOPKART.category, apiKey: process.env.SHOPKART_MERCHANT_KEY ?? 'dev-shopkart-key-change-me' },
  });
  await db.lender.createMany({ data: LENDERS.map((l) => ({ ...l })) });
  await db.insurer.create({ data: { id: INSURER.id, name: INSURER.name } });
  await db.insuranceProduct.createMany({
    data: INSURER.products.map((p) => ({
      id: p.id,
      insurerId: INSURER.id,
      name: p.name,
      kind: p.kind,
      ratesJson: JSON.stringify(p.rates),
      wellnessRewardMaxPct: p.wellnessRewardMaxPct,
    })),
  });
  await db.fundHouse.create({ data: { id: FUND_HOUSE.id, name: FUND_HOUSE.name } });
  await db.scheme.createMany({ data: FUND_HOUSE.schemes.map((s) => ({ ...s, id: `sch_${s.code}`, fundHouseId: FUND_HOUSE.id })) });
  await db.vpa.createMany({ data: OTHER_VPAS.map((v) => ({ handle: v.handle, name: v.name })) });

  for (const w of worlds) {
    const f = w.fixture;
    const p = w.persona;
    await db.person.create({
      data: { id: w.ids.person, personaKey: f.key, name: p.name, phone: p.phone, panMock: f.panMock, dob: f.dob, city: p.city, employer: f.employer },
    });
    await db.personaBehaviour.create({
      data: {
        personId: w.ids.person,
        billPayHabit: f.behaviour.billPayHabit,
        monthlySpendPaise: f.card.monthlySpendPaise,
        salaryPaise: f.salaryPaise,
        avgDailySteps: f.behaviour.avgDailySteps,
      },
    });
    await db.bankAccount.create({
      data: { id: w.ids.account, personId: w.ids.person, accountNo: `50100${p.phone.slice(-6)}`, ifsc: BANK.ifsc, kind: 'salary', balancePaise: f.savingsBalancePaise },
    });
    await db.bankTxn.createMany({ data: w.bankTxns.map((t) => ({ accountId: w.ids.account, ...t })) });
    await db.vpa.create({ data: { handle: p.vpa, name: p.name, personId: w.ids.person, accountId: w.ids.account, pin: DEMO_UPI_PIN } });
    await db.upiTxn.createMany({
      data: w.upiPayments.map((u) => ({
        id: `utx_${u.id}`,
        payerVpa: p.vpa,
        payeeVpa: u.payeeVpa,
        amountPaise: u.amountPaise,
        note: u.note,
        status: 'success',
        rrn: u.rrn,
        initiatedVia: 'cred',
        clientRef: u.id,
        returnUrl: 'http://localhost:3000/upi',
        createdAt: u.at,
      })),
    });

    await db.creditCardAccount.create({
      data: {
        id: w.ids.card,
        personId: w.ids.person,
        bankName: BANK.name,
        network: f.card.network,
        last4: f.card.last4,
        token: w.ids.cardToken,
        limitPaise: f.card.limitPaise,
        outstandingPaise: w.outstandingPaise,
        billingDay: f.card.billingDay,
        dueDay: f.card.dueDay,
      },
    });
    for (const s of w.statements) {
      await db.cardStatement.create({
        data: {
          id: s.id,
          cardAccountId: w.ids.card,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          totalDuePaise: s.totalDuePaise,
          minDuePaise: s.minDuePaise,
          paidPaise: s.paidPaise,
          dueDate: s.dueDate,
          payments: s.payment
            ? { create: { id: s.payment.id, amountPaise: s.payment.amountPaise, receivedAt: s.payment.paidAt, onTime: s.payment.onTime, clientRef: null } }
            : undefined,
        },
      });
    }
    await db.cardCharge.createMany({
      data: w.charges.map((c) => ({
        id: c.id,
        cardAccountId: w.ids.card,
        merchant: c.merchant,
        category: c.category,
        amountPaise: c.amountPaise,
        postedAt: c.postedAt,
        statementId: c.statementId,
      })),
    });

    for (const [i, fd] of (f.fixedDeposits ?? []).entries()) {
      await db.fixedDeposit.create({ data: { id: `fd_${f.key}_${i}`, personId: w.ids.person, ...fd } });
    }
    for (const h of f.funds ?? []) {
      await db.fundHolding.create({
        data: {
          id: `fh_${f.key}_${h.schemeCode}`,
          personId: w.ids.person,
          schemeId: `sch_${h.schemeCode}`,
          folio: folioFor(w),
          units: h.units,
          costPaise: h.costPaise,
          acquiredOn: h.acquiredOn,
        },
      });
    }
    if (f.goldGrams) {
      await db.goldHolding.create({ data: { id: `gold_${f.key}`, personId: w.ids.person, ...f.goldGrams } });
    }
    // Members who share activity with CRED have their latest score with the insurer of a floater bought through CRED
    const shares = !!f.wearable && f.cred.permissions.some((x) => x.scope === 'health_data');
    const weeks = shares ? [0, 1, 2, 3].map((k) => summariseActivityWeek(w.stepDays[k * 7]!.date, w.stepDays.slice(k * 7, k * 7 + 7))) : [];
    const score = weeks.length ? Math.round(weeks.reduce((a, x) => a + x.score, 0) / weeks.length) : null;
    for (const [i, pol] of (f.policies ?? []).entries()) {
      await db.policy.create({
        data: {
          id: policyIdFor(w, i),
          personId: w.ids.person,
          productId: pol.productId,
          coverPaise: pol.coverPaise,
          annualPremiumPaise: pol.annualPremiumPaise,
          isEmployer: pol.isEmployer,
          employerName: pol.employerName ?? null,
          membersCoveredJson: JSON.stringify(pol.members),
          renewalDate: pol.renewalDate,
          clientRef: pol.viaCred ? w.ids.member : null,
          wellnessScore: pol.viaCred ? score : null,
        },
      });
    }
    // Account Aggregator consents CRED already holds (same handles and ids on both sides)
    const consents = [
      ...(f.cred.portfolioLinked
        ? [{ key: 'portfolio', purpose: 'portfolio_tracking', fiTypes: ['MUTUAL_FUNDS', 'TERM_DEPOSIT'], refs: ['fip:amc_meridian', ...(f.fixedDeposits ?? []).map((_, i) => `fd_${f.key}_${i}`)], months: 12, on: '2025-06-18' }]
        : []),
      ...(f.cred.insuranceLinked ? [{ key: 'insurance', purpose: 'protection_review', fiTypes: ['INSURANCE_POLICIES'], refs: ['fip:ins_sahaj'], months: 1, on: '2025-11-12' }] : []),
    ];
    for (const c of consents) {
      await db.aaConsentRequest.create({
        data: {
          consentHandle: `aah_${f.key}_${c.key}`,
          consentId: `aac_${f.key}_${c.key}`,
          fiu: 'CRED',
          personId: w.ids.person,
          purpose: c.purpose,
          fiTypesJson: JSON.stringify(c.fiTypes),
          dataRangeMonths: c.months,
          accountRefsJson: JSON.stringify(c.refs),
          status: 'ACTIVE',
          clientRef: `aah_${f.key}_${c.key}`,
          redirectUrl: 'http://localhost:3000/',
          createdAt: at(c.on),
          decidedAt: at(c.on),
        },
      });
    }

    if (f.wearable) {
      const shared = f.cred.permissions.some((x) => x.scope === 'health_data');
      await db.wearableLink.create({
        data: {
          id: `wl_${f.key}`,
          personId: w.ids.person,
          provider: f.wearable.provider,
          sharedWith: shared ? 'cred' : 'none',
          clientRef: w.ids.member,
          linkedAt: at('2025-11-12'),
        },
      });
      await db.stepDay.createMany({ data: w.stepDays.map((d) => ({ personId: w.ids.person, ...d })) });
    }
  }
}

export const folioFor = (w: PersonaWorld) => `MER${w.fixture.panMock.slice(5, 9)}${w.persona.phone.slice(-2)}`;
export const policyIdFor = (w: PersonaWorld, i: number) => `pol_${w.fixture.key}_${i}`;
export const goldValuePaise = (grams: number) => Math.round(grams * GOLD_PRICE_PER_GRAM_PAISE);
