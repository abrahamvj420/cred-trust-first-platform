import { formatBps, formatInr, type OfferOption } from '@cred/types';
import { cardCost, emiCost } from '../finance';
import { capCheck, Decision, permissionCheck, stressCheck, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { MemberSnapshot, QuoteInput } from '../snapshot';
import { loanTerms } from './big-spend';

/**
 * Card-Balance Switch (feature 8). The member paid only part of a card bill in
 * CRED, so the rest will carry at card interest. Moving it to an EMI costs
 * less; the rate steps down for on-time payments.
 */
export interface PartialPaymentTrigger {
  /** The statement part-paid; one offer per statement, never repeated. */
  statementRef: string;
  /** What's left on the bill after the payment: the balance that would carry. */
  remainingPaise: number;
  paidPaise: number;
}

/** Interest saved if every EMI is on time and the rate steps down (shown separately; never counted in the headline saving). */
export function stepDownBonusPaise(principalPaise: number, months: number, q: QuoteInput, rules: RuleValues = DEFAULT_RULES): number {
  const steps = [...(q.rateStepDown ?? [])].sort((a, b) => a.afterOnTimePayments - b.afterOnTimePayments);
  if (!steps.length) return 0;
  const flat = emiCost(principalPaise, months, q.ratePaBps, q.feeBps, rules.gstBps);
  // Re-price the remaining balance at each step: same EMI schedule logic as the lender
  let balance = principalPaise;
  let rate = q.ratePaBps;
  let interest = 0;
  for (let n = 1; n <= months; n++) {
    const step = steps.filter((s) => s.afterOnTimePayments < n).at(-1);
    if (step) rate = step.ratePaBps;
    const r = rate / 10_000 / 12;
    const left = months - n + 1;
    const emi = r === 0 ? balance / left : (balance * r) / (1 - (1 + r) ** -left);
    const i = Math.round(balance * r);
    interest += i;
    balance -= Math.round(emi) - i;
    if (n === months) balance = 0;
  }
  return Math.max(0, flat.interestPaise - interest);
}

export function evaluateBalanceSwitch(s: MemberSnapshot, trigger: PartialPaymentTrigger, quotes: QuoteInput[] | null, opts: { rules?: RuleValues } = {}): EngineResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const d = new Decision('card_balance_switch', 'proactive');
  const amount = trigger.remainingPaise;
  const amt = formatInr(amount);
  const months = rules.switchTenureMonths;

  // 1. Signal: a part payment leaves a balance worth switching
  if (s.offers.offeredTriggerRefs.includes(trigger.statementRef)) {
    return d.stop('signal', 'already_offered', 'This bill already had a switch offer; offers are never repeated.', 'We’ve already shown you options for this bill, and we don’t repeat them.');
  }
  if (amount < rules.switchMinBalancePaise) {
    return d.stop(
      'signal',
      'no_signal',
      `Remaining ${amt} is below the ${formatInr(rules.switchMinBalancePaise)} switch minimum.`,
      `The ${amt} left on this bill is small, so moving it to an EMI wouldn’t be worth it. Paying it by the due date avoids interest.`,
    );
  }
  d.pass('signal', `Paid ${formatInr(trigger.paidPaise)}; ${amt} would carry.`);

  // 2. Permission → 3. Stress → 4. Offer cap
  const stop = permissionCheck(d, s, rules) ?? stressCheck(d, s, rules) ?? capCheck(d, s, rules);
  if (stop) return stop;

  // 5. Affordability (worst case at the highest partner rate)
  const noCredit = (detail: string) => d.stop('affordability', 'above_affordability', detail, 'This would stretch your monthly budget, so we’re not suggesting an EMI. Paying what you can by the due date keeps interest down.');
  if (amount > s.ladder.limitPaise) return noCredit(`${amt} is above the credit limit of ${formatInr(s.ladder.limitPaise)}.`);
  const incomeCap = s.verifiedMonthlyIncomePaise === null ? null : Math.round((s.verifiedMonthlyIncomePaise * rules.maxEmiToIncomeBps) / 10_000);
  if (incomeCap !== null && emiCost(amount, months, rules.partnerRateMaxBps, rules.processingFeeBps, rules.gstBps).emiPaise + s.existingEmiPaise > incomeCap) {
    return noCredit(`EMIs would exceed ${formatBps(rules.maxEmiToIncomeBps)} of income.`);
  }
  d.pass('affordability', `Within the limit of ${formatInr(s.ladder.limitPaise)}${incomeCap !== null ? ' and the income cap' : ''}.`);

  // 6. Likely to carry: the member chose to carry it by paying part
  d.pass('likely_to_carry', `Member paid part of the bill; ${amt} carries.`);

  if (!quotes) return { kind: 'needs_quotes', principalPaise: amount, tenureMonths: months };
  const usable = quotes.filter(
    (q) =>
      q.kind === 'balance_switch_emi' &&
      q.principalPaise === amount &&
      q.tenureMonths === months &&
      (incomeCap === null || emiCost(amount, months, q.ratePaBps, q.feeBps, rules.gstBps).emiPaise + s.existingEmiPaise <= incomeCap),
  );
  const q = usable.sort((a, b) => a.ratePaBps - b.ratePaBps)[0];
  if (!q) {
    return quotes.length
      ? noCredit('No partner quote fits affordability.')
      : d.stop('net_benefit', 'not_eligible', 'No partner quotes available.', 'Our lending partners couldn’t give a price just now. Please try again a little later.');
  }

  // 7. Net benefit: carrying on the card vs the switch EMI, at the starting rate
  const card = cardCost(amount, months, rules.cardInterestMonthlyBps, rules.gstBps);
  const terms = loanTerms(q, rules);
  const switchCost = terms.totalInterestPaise + terms.processingFeePaise + terms.gstOnFeePaise;
  const net = card.totalCostPaise - switchCost;
  if (net <= 0) {
    return d.stop('net_benefit', 'no_net_benefit', 'Switching is not cheaper than carrying on the card.', 'Moving this balance wouldn’t cost less than your card here, so there’s nothing to save.');
  }
  d.pass('net_benefit', `Saves ${formatInr(net)} vs carrying ${amt} on the card for ${months} months.`);

  const bonus = stepDownBonusPaise(amount, months, q, rules);
  const steps = (q.rateStepDown ?? []).map((x) => `${formatBps(x.ratePaBps)} after ${x.afterOnTimePayments} on-time EMIs`).join(', then ');
  const options: OfferOption[] = [
    {
      key: 'pay_in_full',
      label: 'Pay the rest by the due date',
      totalCostPaise: 0,
      monthlyPaise: null,
      lines: [],
      acceptable: false,
      recommended: false,
      note: `Cheapest of all if you can pay the remaining ${amt} by the due date.`,
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
    {
      key: 'emi',
      label: `Switch it to a ${months}-month EMI`,
      totalCostPaise: switchCost,
      monthlyPaise: terms.emiPaise,
      lines: [
        { label: `Interest at ${formatBps(q.ratePaBps)} a year`, amountPaise: terms.totalInterestPaise, kind: 'interest' },
        { label: `Processing fee (${formatBps(q.feeBps)})`, amountPaise: terms.processingFeePaise, kind: 'fee' },
        { label: `GST on fee (${formatBps(rules.gstBps)})`, amountPaise: terms.gstOnFeePaise, kind: 'tax' },
      ],
      acceptable: true,
      recommended: true,
      note:
        `${q.lenderName} pays ${amt} to your card; you repay ${q.lenderName} monthly.` +
        (steps ? ` Your rate steps down: ${steps}${bonus > 0 ? `, about ${formatInr(bonus)} less interest if every EMI is on time (not counted in the saving above)` : ''}.` : ''),
      terms,
    },
  ];
  const why =
    `You paid ${formatInr(trigger.paidPaise)} of your card bill, so ${amt} will carry at ${formatBps(rules.cardInterestMonthlyBps)} a month. ` +
    `If you carry it, an EMI costs ${formatInr(net)} less over ${months} months. Paying the rest by the due date is still cheapest.` +
    (d.awaitingPermission ? ' We’ll only show it if you turn on Smart Savings.' : ' You see it because Smart Savings is on.');
  return d.offer(
    net,
    {
      headline: `If you carry the remaining ${amt}, moving it to an EMI saves you ${formatInr(net)} compared with keeping it on the card`,
      subline: `${months} months from ${formatBps(q.ratePaBps)}: ${formatInr(terms.emiPaise)} a month, and the rate steps down when you pay on time.`,
      benefitLabel: 'less than card interest',
      comparison: {
        current: { label: options[1]!.label, totalCostPaise: card.totalCostPaise, lines: options[1]!.lines },
        proposed: { label: options[2]!.label, totalCostPaise: switchCost, lines: options[2]!.lines },
        netBenefitPaise: net,
      },
      options,
      terms,
      trigger: { merchant: 'Card bill', amountPaise: amount },
      quoteRefs: { emi: q.quoteRef },
      context: { statementRef: trigger.statementRef },
    },
    why,
  );
}
