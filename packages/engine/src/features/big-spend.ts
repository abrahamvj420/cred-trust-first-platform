import { formatBps, formatInr, type LoanTerms, type OfferOption, type TriggerOrigin } from '@cred/types';
import { cardCost, emiCost } from '../finance';
import { capCheck, Decision, permissionCheck, stressCheck, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { CardPurchaseTrigger, MemberSnapshot, QuoteInput } from '../snapshot';

const FEATURE = 'big_spend_support' as const;

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const settled = (s: MemberSnapshot) => s.statements.filter((x) => x.paymentKind !== null);

/** Typical monthly spend: average bill of the last three settled statements. */
export function typicalMonthlySpendPaise(s: MemberSnapshot): number {
  return avg(settled(s).slice(0, 3).map((x) => x.totalDuePaise));
}

export function bigSpendThresholdPaise(s: MemberSnapshot, rules: RuleValues = DEFAULT_RULES): number {
  return Math.max(rules.bigSpendMinPaise, Math.round((typicalMonthlySpendPaise(s) * rules.bigSpendShareOfMonthlySpendBps) / 10_000));
}

export interface CarryAssessment {
  /** Next statement estimate: everything outstanding except the open bill that falls due first. */
  projectedBillPaise: number;
  typicalRepaymentPaise: number;
  /** Verified income − EMIs − typical repayment; null when salary isn't shared. */
  surplusPaise: number | null;
  capacityPaise: number;
  likelyToCarry: boolean;
}

/** Can the member clear the next bill in one go, judging by how they actually repay? */
export function assessCarry(s: MemberSnapshot, rules: RuleValues = DEFAULT_RULES): CarryAssessment {
  const open = s.statements[0];
  const openDue = open && open.paymentKind === null && open.dueDate >= s.today ? Math.max(0, open.totalDuePaise - open.paidPaise) : 0;
  const projectedBillPaise = Math.max(0, s.card.outstandingPaise - openDue);
  const typicalRepaymentPaise = avg(settled(s).slice(0, rules.carryLookbackStatements).map((x) => x.paidPaise));
  const surplusPaise = s.verifiedMonthlyIncomePaise === null ? null : Math.max(0, s.verifiedMonthlyIncomePaise - s.existingEmiPaise - typicalRepaymentPaise);
  const byHistory = Math.round((typicalRepaymentPaise * rules.carryRepaymentMultipleBps) / 10_000);
  const capacityPaise = surplusPaise === null ? byHistory : Math.max(byHistory, typicalRepaymentPaise + surplusPaise);
  return { projectedBillPaise, typicalRepaymentPaise, surplusPaise, capacityPaise, likelyToCarry: projectedBillPaise > capacityPaise };
}

function loanTerms(q: QuoteInput, rules: RuleValues): LoanTerms {
  const c = emiCost(q.principalPaise, q.tenureMonths, q.ratePaBps, q.feeBps, rules.gstBps);
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

/** The side-by-side comparison, all costs from the savings method. Paying in full always comes first. */
export function bigSpendOptions(amountPaise: number, months: number, quotes: QuoteInput[], rules: RuleValues = DEFAULT_RULES): OfferOption[] {
  const card = cardCost(amountPaise, months, rules.cardInterestMonthlyBps, rules.gstBps);
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
        { label: `Card interest at ${formatBps(rules.cardInterestMonthlyBps)} a month`, amountPaise: card.interestPaise, kind: 'interest' },
        { label: `GST on interest (${formatBps(rules.gstBps)})`, amountPaise: card.gstOnInterestPaise, kind: 'tax' },
      ],
      acceptable: false,
      recommended: false,
      note: null,
      terms: null,
    },
  ];
  for (const q of quotes) {
    const t = loanTerms(q, rules);
    const isEmi = q.kind === 'purchase_emi';
    options.push({
      key: isEmi ? 'emi' : 'loan',
      label: isEmi ? `${months}-month EMI on this purchase` : `Pre-approved personal loan, ${months} months`,
      totalCostPaise: t.totalInterestPaise + t.processingFeePaise + t.gstOnFeePaise,
      monthlyPaise: t.emiPaise,
      lines: [
        { label: `Interest at ${formatBps(q.ratePaBps)} a year`, amountPaise: t.totalInterestPaise, kind: 'interest' },
        { label: `Processing fee (${formatBps(q.feeBps)})`, amountPaise: t.processingFeePaise, kind: 'fee' },
        { label: `GST on fee (${formatBps(rules.gstBps)})`, amountPaise: t.gstOnFeePaise, kind: 'tax' },
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

export interface EvaluateOptions {
  origin?: TriggerOrigin;
  rules?: RuleValues;
}

/**
 * Big-Spend Support. Checks, in order: signal → permission → stress → offer cap
 * → affordability → likely to carry → net benefit. Call with quotes = null first;
 * if the result asks for quotes, fetch indicative partner quotes and call again.
 */
export function evaluateBigSpend(s: MemberSnapshot, trigger: CardPurchaseTrigger, quotes: QuoteInput[] | null, opts: EvaluateOptions = {}): EngineResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const origin = opts.origin ?? 'proactive';
  const d = new Decision(FEATURE, origin);
  const amount = trigger.amountPaise;
  const amt = formatInr(amount);
  const months = rules.offerTenureMonths;

  // 1. Signal
  if (origin === 'proactive') {
    const threshold = bigSpendThresholdPaise(s, rules);
    if (s.offers.offeredTriggerRefs.includes(trigger.transactionRef)) {
      return d.stop('signal', 'already_offered', 'This purchase already had an offer; offers are never repeated.', 'We’ve already shown you options for this purchase, and we don’t repeat them.');
    }
    if (amount < threshold) {
      return d.stop('signal', 'no_signal', `No signal: ${amt} is below the ${formatInr(threshold)} threshold.`, `${amt} at ${trigger.merchant} looks like everyday spending, so there was nothing to suggest.`);
    }
    d.pass('signal', `${amt} at ${trigger.merchant} is above ${formatInr(threshold)}.`);
  } else {
    if (amount < rules.memberEmiMinPaise) {
      return d.stop('signal', 'not_eligible', `Below the ${formatInr(rules.memberEmiMinPaise)} EMI minimum.`, `EMI is available on purchases of ${formatInr(rules.memberEmiMinPaise)} or more.`);
    }
    d.pass('signal', `Member asked to convert ${amt} at ${trigger.merchant}.`);
  }

  // 2. Permission → 3. Stress → 4. Offer cap
  const stop = permissionCheck(d, s, rules) ?? stressCheck(d, s, rules) ?? capCheck(d, s, rules);
  if (stop) return stop;

  // 5. Affordability (worst case at the highest partner rate)
  const noCredit = (detail: string, why: string) => d.stop('affordability', 'above_affordability', detail, why);
  if (amount > s.ladder.limitPaise) {
    return noCredit(
      `${amt} is above the ${s.ladder.tier} tier limit of ${formatInr(s.ladder.limitPaise)}.`,
      'This would stretch your monthly budget, so we’re not suggesting a loan.',
    );
  }
  const incomeCap = s.verifiedMonthlyIncomePaise === null ? null : Math.round((s.verifiedMonthlyIncomePaise * rules.maxEmiToIncomeBps) / 10_000);
  if (incomeCap !== null) {
    const worstEmi = emiCost(amount, months, rules.partnerRateMaxBps, rules.processingFeeBps, rules.gstBps).emiPaise;
    if (worstEmi + s.existingEmiPaise > incomeCap) {
      return noCredit(
        `EMIs of ${formatInr(worstEmi + s.existingEmiPaise)} would exceed ${formatBps(rules.maxEmiToIncomeBps)} of income (${formatInr(incomeCap)}).`,
        'This would stretch your monthly budget, so we’re not suggesting a loan.',
      );
    }
  }
  d.pass('affordability', `Within the ${s.ladder.tier} tier limit of ${formatInr(s.ladder.limitPaise)}${incomeCap !== null ? ' and the income cap' : ''}.`);

  // 6. Likely to carry (proactive only: a member who asks has already decided)
  const carry = assessCarry(s, rules);
  if (origin === 'proactive') {
    const basis = `next bill about ${formatInr(carry.projectedBillPaise)} vs capacity ${formatInr(carry.capacityPaise)} (typical repayment ${formatInr(carry.typicalRepaymentPaise)}${carry.surplusPaise !== null ? `, surplus ${formatInr(carry.surplusPaise)}` : ''})`;
    if (!carry.likelyToCarry) {
      return d.stop(
        'likely_to_carry',
        'can_pay_in_full',
        `Can pay in full: ${basis}.`,
        `Looks like you’ll clear this by the due date, so there’s nothing to save. If you’d still like to spread it out, tap Convert to EMI on the purchase.`,
      );
    }
    d.pass('likely_to_carry', `Likely to carry: ${basis}.`);
  } else {
    d.pass('likely_to_carry', 'Skipped: member asked for EMI.');
  }

  if (!quotes) return { kind: 'needs_quotes', principalPaise: amount, tenureMonths: months };

  // Re-check affordability against the actual quotes, never just the assumption.
  const usable = quotes.filter((q) => {
    if (q.principalPaise !== amount || q.tenureMonths !== months) return false;
    if (incomeCap === null) return true;
    return emiCost(q.principalPaise, q.tenureMonths, q.ratePaBps, q.feeBps, rules.gstBps).emiPaise + s.existingEmiPaise <= incomeCap;
  });
  if (!usable.length) {
    return quotes.length
      ? noCredit('No partner quote fits affordability.', 'This would stretch your monthly budget, so we’re not suggesting a loan.')
      : d.stop('net_benefit', 'not_eligible', 'No partner quotes available.', 'Our lending partners couldn’t give a price just now. Please try again a little later.');
  }

  // 7. Net benefit, in rupees, from the savings method
  const options = bigSpendOptions(amount, months, usable, rules);
  const card = options.find((o) => o.key === 'card_revolve')!;
  const best = options.find((o) => o.recommended)!;
  const net = card.totalCostPaise - best.totalCostPaise;
  if (net <= 0) {
    return d.stop('net_benefit', 'no_net_benefit', 'No option is cheaper than keeping it on the card.', 'None of the EMI or loan options would cost less than your card here, so there’s nothing to save.');
  }
  d.pass('net_benefit', `Saves ${formatInr(net)} vs paying it off on the card over ${months} months.`);

  const terms = best.terms!;
  const product = best.key === 'emi' ? 'an EMI' : 'a personal loan';
  const saving = formatInr(net);
  const why =
    origin === 'member_initiated'
      ? `You asked to convert your ${amt} ${trigger.merchant} purchase. Compared with carrying it on your card for ${months} months, ${product} costs ${saving} less. Paying the full bill by the due date is still cheapest.`
      : `You’re seeing this because your ${amt} purchase at ${trigger.merchant} is bigger than your usual spending, and your next bill would be about ${formatInr(carry.projectedBillPaise)}, more than you usually repay in a month (about ${formatInr(carry.typicalRepaymentPaise)}). ` +
        `If you can’t clear it by the due date, ${product} costs ${saving} less than card interest. Paying in full is still cheapest.` +
        (d.awaitingPermission ? ' We’ll only show it if you turn on Smart Savings.' : ' You see it because Smart Savings is on.');

  return d.offer(
    net,
    {
      headline: `If you can’t clear ${amt} by the due date, ${product} saves you ${saving} compared with carrying it`,
      subline: `${months} months at ${formatBps(terms.ratePaBps)}: ${formatInr(terms.emiPaise)} a month. Paying the full bill is still cheapest.`,
      comparison: {
        current: { label: card.label, totalCostPaise: card.totalCostPaise, lines: card.lines },
        proposed: { label: best.label, totalCostPaise: best.totalCostPaise, lines: best.lines },
        netBenefitPaise: net,
      },
      options,
      terms,
      trigger: { merchant: trigger.merchant, amountPaise: amount },
      quoteRefs: Object.fromEntries(usable.map((q) => [q.kind === 'purchase_emi' ? 'emi' : 'loan', q.quoteRef])),
    },
    why,
  );
}
