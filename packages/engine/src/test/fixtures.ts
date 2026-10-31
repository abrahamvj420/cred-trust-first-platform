import type { MemberSnapshot, QuoteInput } from '../snapshot';

/** A healthy full payer like Aarav, just after a ₹1.5L purchase. */
export const fullPayer = (over: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
  memberId: 'm',
  today: '2026-11-02',
  card: { limitPaise: 4_00_000_00, outstandingPaise: 2_22_000_00 },
  statements: [
    { periodEnd: '2026-10-15', totalDuePaise: 46_000_00, minDuePaise: 2_300_00, paidPaise: 0, dueDate: '2026-11-05', paymentKind: null, onTime: null },
    ...[9, 8, 7, 6, 5, 4].map((m) => ({
      periodEnd: `2026-0${m}-15`,
      totalDuePaise: 45_000_00,
      minDuePaise: 2_250_00,
      paidPaise: 45_000_00,
      dueDate: `2026-${String(m + 1).padStart(2, '0')}-05`,
      paymentKind: 'full' as const,
      onTime: true,
    })),
  ],
  smartSavings: 'granted',
  smartSavingsLastAskedOn: null,
  verifiedMonthlyIncomePaise: null,
  existingEmiPaise: 0,
  ladder: { tier: 'gold', limitPaise: 3_00_000_00 },
  offers: { activeOfferId: null, proactiveThisMonth: 0, offeredTriggerRefs: [], declines: [] },
  helpThisMonth: 0,
  ...over,
});

export const laptop = { transactionRef: 't1', merchant: 'ShopKart', amountPaise: 1_50_000_00 };

export const quotesFor = (amountPaise: number, emiRate = 1600, loanRate = 1800): QuoteInput[] => [
  { quoteRef: 'q1', lenderName: 'Northstar Finance', kind: 'purchase_emi', principalPaise: amountPaise, tenureMonths: 12, ratePaBps: emiRate, feeBps: 100 },
  { quoteRef: 'q2', lenderName: 'Banyan Credit', kind: 'personal_loan', principalPaise: amountPaise, tenureMonths: 12, ratePaBps: loanRate, feeBps: 100 },
];

/** Minimum-only payer pushed to ~96% by the purchase. */
export const stressed = (over: Partial<MemberSnapshot> = {}): MemberSnapshot => {
  const base = fullPayer();
  return fullPayer({
    card: { limitPaise: 2_50_000_00, outstandingPaise: 2_40_000_00 },
    statements: base.statements.map((x, i) => (i === 0 ? x : { ...x, paymentKind: 'minimum' as const, paidPaise: x.minDuePaise })),
    ...over,
  });
};
