import { formatBps, formatInr, type LoanTerms, type OfferOption } from '@cred/types';
import {
  BIG_SPEND_MIN_PAISE,
  BIG_SPEND_SHARE_OF_MONTHLY_SPEND_BPS,
  MAX_EMI_TO_INCOME_BPS,
  OFFER_TENURE_MONTHS,
  PARTNER_EMI_RATE_PA_BPS,
} from '../constants';
import { cardCost, emiCost } from '../finance';
import { capCheck, Decision, permissionCheck, stressCheck, type EngineResult } from '../pipeline';
import type { CardPurchaseTrigger, MemberSnapshot, QuoteInput } from '../snapshot';

const FEATURE = 'big_spend_support' as const;

/** Typical monthly spend: average bill of the last three settled statements. */
export function typicalMonthlySpendPaise(s: MemberSnapshot): number {
  const settled = s.statements.filter((x) => x.paymentKind !== null).slice(0, 3);
  if (!settled.length) return 0;
  return Math.round(settled.reduce((a, x) => a + x.totalDuePaise, 0) / settled.length);
}

export function bigSpendThresholdPaise(s: MemberSnapshot): number {
  return Math.max(BIG_SPEND_MIN_PAISE, Math.round((typicalMonthlySpendPaise(s) * BIG_SPEND_SHARE_OF_MONTHLY_SPEND_BPS) / 10_000));
}

function loanTerms(q: QuoteInput): LoanTerms {
  const c = emiCost(q.principalPaise, q.tenureMonths, q.ratePaBps, q.feeBps);
  return {
    kind: 'loan',
    loanKind: q.kind,
    lenderName: q.lenderName,
    principalPaise: q.principalPaise,
    ratePaBps: q.ratePaBps,
    tenureMonths: q.tenureMonths,
    emiPaise: c.emiPaise,
    processingFeePaise: c.processingFeePaise,
    gstOnFeePaise: c.gstOnFeePaise,
    totalInterestPaise: c.interestPaise,
  };
}

/** The side-by-side comparison, all costs from the savings method. */
export function bigSpendOptions(amountPaise: number, months: number, quotes: QuoteInput[]): OfferOption[] {
  const card = cardCost(amountPaise, months);
  const options: OfferOption[] = [
    {
      key: 'pay_in_full',
      label: 'Pay the full bill by the due date',
      totalCostPaise: 0,
      monthlyPaise: null,
      lines: [],
      acceptable: false,
      recommended: false,
      note: `Cheapest of all if you can pay ${formatInr(amountPaise)} when the bill is due. Nothing to sign up for.`,
      terms: null,
    },
    {
      key: 'card_revolve',
      label: `Keep it on the card, pay over ${months} months`,
      totalCostPaise: card.totalCostPaise,
      monthlyPaise: card.schedule[0]!.paymentPaise,
      lines: [
        { label: 'Card interest at 3.5% a month', amountPaise: card.interestPaise, kind: 'interest' },
        { label: 'GST on interest (18%)', amountPaise: card.gstOnInterestPaise, kind: 'tax' },
      ],
      acceptable: false,
      recommended: false,
      note: null,
      terms: null,
    },
  ];
  for (const q of quotes) {
    const t = loanTerms(q);
    const isEmi = q.kind === 'purchase_emi';
    options.push({
      key: isEmi ? 'emi' : 'loan',
      label: isEmi ? `${months}-month EMI on this purchase` : `Pre-approved personal loan, ${months} months`,
      totalCostPaise: t.totalInterestPaise + t.processingFeePaise + t.gstOnFeePaise,
      monthlyPaise: t.emiPaise,
      lines: [
        { label: `Interest at ${formatBps(q.ratePaBps)} a year`, amountPaise: t.totalInterestPaise, kind: 'interest' },
        { label: `Processing fee (${formatBps(q.feeBps)})`, amountPaise: t.processingFeePaise, kind: 'fee' },
        { label: 'GST on fee (18%)', amountPaise: t.gstOnFeePaise, kind: 'tax' },
      ],
      acceptable: true,
      recommended: false,
      note: isEmi ? `${q.lenderName} pays the card; you repay ${q.lenderName} monthly.` : `${q.lenderName} pays into your bank account; you then clear the card bill.`,
      terms: t,
    });
  }
  const best = options.filter((o) => o.acceptable).sort((a, b) => a.totalCostPaise - b.totalCostPaise)[0];
  if (best) best.recommended = true;
  return options;
}

/**
 * Big-Spend Support. Call with quotes = null first; if the result asks for
 * quotes, fetch indicative partner quotes and call again.
 */
export function evaluateBigSpend(s: MemberSnapshot, trigger: CardPurchaseTrigger, quotes: QuoteInput[] | null): EngineResult {
  const d = new Decision(FEATURE, 'proactive');
  const amount = trigger.amountPaise;

  // 1. Signal: is this an unusually large purchase?
  const threshold = bigSpendThresholdPaise(s);
  if (s.offers.offeredTriggerRefs.includes(trigger.transactionRef)) {
    return d.stop('signal', 'already_offered', 'This purchase already had an offer. Offers are never repeated.');
  }
  if (amount < threshold) {
    return d.stop('signal', 'no_signal', `No signal: ${formatInr(amount)} is normal spending (threshold ${formatInr(threshold)}).`);
  }
  d.pass('signal', `${formatInr(amount)} at ${trigger.merchant} is above ${formatInr(threshold)}.`);

  // 2. Permission → 3. Stress → 4. Offer cap
  const stop = permissionCheck(d, s) ?? stressCheck(d, s) ?? capCheck(d, s, FEATURE);
  if (stop) return stop;

  // 5. Affordability: never more credit than the member can carry.
  if (amount > s.ladder.limitPaise) {
    return d.stop('affordability', 'above_affordability', `${formatInr(amount)} is above the ${s.ladder.tier} tier limit of ${formatInr(s.ladder.limitPaise)}.`);
  }
  if (s.verifiedMonthlyIncomePaise) {
    const worstEmi = emiCost(amount, OFFER_TENURE_MONTHS, PARTNER_EMI_RATE_PA_BPS.max).emiPaise;
    const cap = Math.round((s.verifiedMonthlyIncomePaise * MAX_EMI_TO_INCOME_BPS) / 10_000);
    if (worstEmi + s.existingEmiPaise > cap) {
      return d.stop('affordability', 'above_affordability', `EMIs of ${formatInr(worstEmi + s.existingEmiPaise)} would exceed 40% of income (${formatInr(cap)}).`);
    }
  }
  d.pass('affordability', `Within the ${s.ladder.tier} tier limit of ${formatInr(s.ladder.limitPaise)}.`);

  if (!quotes) return { kind: 'needs_quotes', principalPaise: amount, tenureMonths: OFFER_TENURE_MONTHS };

  // 6. Net benefit, in rupees, from the savings method.
  const options = bigSpendOptions(amount, OFFER_TENURE_MONTHS, quotes);
  const card = options.find((o) => o.key === 'card_revolve')!;
  const best = options.find((o) => o.recommended);
  const net = best ? card.totalCostPaise - best.totalCostPaise : 0;
  if (!best || net <= 0) {
    return d.stop('net_benefit', 'no_net_benefit', 'No option is cheaper than keeping it on the card, so no offer.');
  }
  d.pass('net_benefit', `Saves ${formatInr(net)} vs paying it off on the card over ${OFFER_TENURE_MONTHS} months.`);

  const terms = best.terms!;
  return d.offer(net, {
    headline: `Save ${formatInr(net)} on your ${trigger.merchant} purchase`,
    subline: `Spread ${formatInr(amount)} over ${OFFER_TENURE_MONTHS} months at ${formatBps(terms.ratePaBps)} instead of paying card interest.`,
    comparison: {
      current: { label: card.label, totalCostPaise: card.totalCostPaise, lines: card.lines },
      proposed: { label: best.label, totalCostPaise: best.totalCostPaise, lines: best.lines },
      netBenefitPaise: net,
    },
    options,
    terms,
    trigger: { merchant: trigger.merchant, amountPaise: amount },
    quoteRefs: Object.fromEntries(quotes.map((q) => [q.kind === 'purchase_emi' ? 'emi' : 'loan', q.quoteRef])),
  });
}
