import { coinsForBillPayment, tierForStreak } from '@cred/engine';
import { SIM_START_DATE } from '@cred/types';
import type { CredDb } from '../cred';
import { BANK, FUND_HOUSE, INSURER } from './catalog';
import { folioFor, goldValuePaise, policyIdFor } from './ecosystem';
import { wipeAllTables } from './reset';
import { addDays, addMonths, at } from './util';
import { summariseActivityWeek } from './wearable';
import type { PersonaWorld } from './world';

/** Cycles of card transactions CRED holds (it received them as webhooks). */
const CRED_TXN_CYCLES = 3;

/**
 * Seeds only what CRED would legitimately hold today: data delivered by
 * partner webhooks, consented AA pulls, and what the member told CRED.
 */
export async function seedCred(db: CredDb, worlds: PersonaWorld[]): Promise<void> {
  await wipeAllTables(db);
  await db.simState.create({ data: { id: 1, currentDate: SIM_START_DATE } });

  for (const w of worlds) {
    const f = w.fixture;
    const p = w.persona;
    const memberId = w.ids.member;

    await db.member.create({
      data: { id: memberId, personaKey: f.key, name: p.name, phone: p.phone, city: p.city, age: p.age, vpa: p.vpa, memberSince: f.cred.memberSince },
    });

    await db.card.create({
      data: {
        id: `card_${f.key}`,
        memberId,
        issuerName: BANK.name,
        network: f.card.network,
        last4: f.card.last4,
        limitPaise: f.card.limitPaise,
        outstandingPaise: w.outstandingPaise,
        billingDay: f.card.billingDay,
        dueDay: f.card.dueDay,
        customerRef: w.ids.person,
        cardRef: w.ids.card,
      },
    });

    // Statements since the member joined CRED
    const known = w.statements.filter((s) => s.periodEnd >= f.cred.memberSince);
    for (const s of known) {
      await db.statement.create({
        data: {
          id: `stmt_${s.id}`,
          cardId: `card_${f.key}`,
          externalRef: s.id,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          totalDuePaise: s.totalDuePaise,
          minDuePaise: s.minDuePaise,
          paidPaise: s.paidPaise,
          dueDate: s.dueDate,
          status: s.status,
          settledOn: s.payment ? s.dueDate : null,
          ladderOutcome: s.payment ? (s.payment.kind === 'full' ? 'paid_in_full' : 'part_paid') : null,
          payments: s.payment
            ? { create: { externalRef: s.payment.id, kind: s.payment.kind, amountPaise: s.payment.amountPaise, paidAt: s.payment.paidAt, onTime: s.payment.onTime } }
            : undefined,
        },
      });
    }

    const lastCycle = Math.max(...w.charges.map((c) => c.cycle));
    await db.cardTransaction.createMany({
      data: w.charges
        .filter((c) => c.cycle > lastCycle - CRED_TXN_CYCLES)
        .map((c) => ({ cardId: `card_${f.key}`, externalRef: c.id, merchant: c.merchant, category: c.category, amountPaise: c.amountPaise, postedAt: c.postedAt })),
    });

    for (const perm of f.cred.permissions) {
      await db.permission.create({
        data: { memberId, scope: perm.scope, status: 'granted', context: perm.context, grantedAt: at(perm.grantedOn) },
      });
      await db.auditLog.create({
        data: { memberId, actor: 'member', action: 'permission.granted', target: perm.scope, detailsJson: JSON.stringify({ context: perm.context }), at: at(perm.grantedOn) },
      });
    }

    await db.ladderProgress.create({ data: { memberId, tier: tierForStreak(w.onTimeStreak).tier, onTimeStreak: w.onTimeStreak } });

    // Rewards: coins from the last few on-time bill payments, plus an opening balance up to the persona's total
    const earned = known
      .filter((s) => s.payment?.onTime)
      .slice(-5)
      .map((s) => ({ s, coins: coinsForBillPayment(s.payment!.amountPaise, true) }))
      .filter((x) => x.coins > 0);
    const earnedTotal = earned.reduce((a, x) => a + x.coins, 0);
    await db.rewardEntry.create({
      data: { memberId, kind: 'opening', coins: Math.max(0, f.cred.rewardsCoins - earnedTotal), description: 'Coins from earlier bill payments', at: at(f.cred.memberSince) },
    });
    for (const { s, coins } of earned) {
      await db.rewardEntry.create({
        data: { memberId, kind: 'earned', coins, description: 'Bill paid on time', sourceRef: s.payment!.id, at: s.payment!.paidAt },
      });
    }

    await db.upiTransaction.createMany({
      data: w.upiPayments.map((u) => ({
        id: u.id,
        memberId,
        upiTxnRef: `utx_${u.id}`,
        payerVpa: p.vpa,
        payeeVpa: u.payeeVpa,
        payeeName: u.payeeName,
        amountPaise: u.amountPaise,
        note: u.note,
        status: 'success',
        rrn: u.rrn,
        createdAt: u.at,
      })),
    });

    if (f.cred.portfolioLinked) {
      const consentId = `aac_${f.key}_portfolio`;
      await db.aaConsent.create({
        data: {
          memberId,
          consentHandle: `aah_${f.key}_portfolio`,
          consentId,
          purpose: 'portfolio_tracking',
          fiTypesJson: JSON.stringify(['MUTUAL_FUNDS', 'TERM_DEPOSIT']),
          status: 'ACTIVE',
          createdAt: at('2025-06-18'),
          expiresAt: at(addMonths(SIM_START_DATE, 12)),
          lastFetchedAt: at(addDays(SIM_START_DATE, -1)),
        },
      });
      for (const h of f.funds ?? []) {
        const scheme = FUND_HOUSE.schemes.find((s) => s.code === h.schemeCode)!;
        await db.holding.create({
          data: {
            memberId,
            kind: 'mutual_fund',
            assetClass: scheme.category,
            name: scheme.name,
            provider: FUND_HOUSE.name,
            externalRef: folioFor(w),
            schemeCode: scheme.code,
            units: h.units,
            valuePaise: Math.round(h.units * scheme.navPaise),
            costPaise: h.costPaise,
            acquiredAt: h.acquiredOn,
            expenseRatioBps: scheme.expenseRatioBps,
            expectedReturnBps: scheme.expectedReturnBps,
            sourceConsentId: consentId,
          },
        });
      }
      for (const [i, fd] of (f.fixedDeposits ?? []).entries()) {
        await db.holding.create({
          data: {
            memberId,
            kind: 'fixed_deposit',
            assetClass: 'fixed_deposit',
            name: `Fixed Deposit · matures ${fd.maturesOn}`,
            provider: BANK.name,
            externalRef: `fd_${f.key}_${i}`,
            valuePaise: fd.principalPaise,
            costPaise: fd.principalPaise,
            acquiredAt: fd.openedOn,
            expectedReturnBps: fd.ratePaBps,
            sourceConsentId: consentId,
          },
        });
      }
      if (f.goldGrams) {
        // Digital gold is declared by the member in CRED (AA does not carry it)
        await db.holding.create({
          data: {
            memberId,
            kind: 'gold',
            assetClass: 'gold',
            source: 'self_declared',
            name: `Gold · ${f.goldGrams.grams} g`,
            provider: 'Declared by you',
            externalRef: `gold_${f.key}`,
            units: f.goldGrams.grams,
            valuePaise: goldValuePaise(f.goldGrams.grams),
            costPaise: f.goldGrams.costPaise,
            acquiredAt: f.goldGrams.acquiredOn,
            expectedReturnBps: 900,
          },
        });
      }
    }

    for (const g of f.cred.goals ?? []) await db.goal.create({ data: { memberId, ...g } });

    for (const fm of (f.family ?? []).filter((x) => x.knownToCred)) {
      await db.familyMember.create({ data: { memberId, name: fm.name, relation: fm.relation, age: fm.age } });
    }

    // Policies CRED knows: bought through CRED, or read through Account Aggregator (employer cover included)
    const insuranceConsentId = f.cred.insuranceLinked ? `aac_${f.key}_insurance` : null;
    if (insuranceConsentId) {
      await db.aaConsent.create({
        data: {
          memberId,
          consentHandle: `aah_${f.key}_insurance`,
          consentId: insuranceConsentId,
          purpose: 'protection_review',
          fiTypesJson: JSON.stringify(['INSURANCE_POLICIES']),
          status: 'ACTIVE',
          createdAt: at('2025-11-12'),
          expiresAt: at(addMonths(SIM_START_DATE, 12)),
          lastFetchedAt: at(addDays(SIM_START_DATE, -1)),
        },
      });
    }
    for (const [i, pol] of (f.policies ?? []).entries()) {
      if (!pol.viaCred && !insuranceConsentId) continue;
      const product = INSURER.products.find((x) => x.id === pol.productId)!;
      await db.insurancePolicy.create({
        data: {
          memberId,
          externalRef: policyIdFor(w, i),
          insurerName: INSURER.name,
          productName: product.name,
          kind: pol.isEmployer ? 'employer_group_health' : 'health_family_floater',
          coverPaise: pol.coverPaise,
          annualPremiumPaise: pol.annualPremiumPaise,
          isEmployer: pol.isEmployer,
          employerName: pol.employerName ?? null,
          membersCoveredJson: JSON.stringify(pol.members),
          renewalDate: pol.renewalDate,
          source: pol.viaCred ? 'cred_purchase' : 'aa',
        },
      });
    }

    if (f.wearable && f.cred.permissions.some((x) => x.scope === 'health_data')) {
      await db.wearableLink.create({
        data: { memberId, provider: f.wearable.provider, linkRef: `wl_${f.key}`, customerRef: w.ids.person, linkedAt: at('2025-11-12') },
      });
      for (let wk = 0; wk < 4; wk++) {
        const days = w.stepDays.slice(wk * 7, wk * 7 + 7);
        if (days.length === 7) {
          await db.activitySummary.create({ data: { memberId, ...summariseActivityWeek(days[0]!.date, days) } });
        }
      }
    }
  }
}
