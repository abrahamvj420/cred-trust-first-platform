import { formatBps, formatInr, type AssetClass, type CostOption, type OfferOption, type TriggerOrigin } from '@cred/types';
import { emiCost } from '../finance';
import { capCheck, Decision, permissionCheck, stressCheck, type EngineResult } from '../pipeline';
import { DEFAULT_RULES, type RuleValues } from '../rules';
import type { MemberSnapshot, QuoteInput } from '../snapshot';
import { loanTerms } from './big-spend';

/**
 * Wealth-Backed Liquidity (feature 2). When a member starts selling a fund,
 * FD or gold, compare selling (tax, lost returns, FD penalty) with borrowing
 * against it (interest, fee). Borrowing is capped at a conservative share of
 * value. Selling is always allowed.
 */
export interface HoldingInput {
  id: string;
  name: string;
  kind: 'mutual_fund' | 'fixed_deposit' | 'gold';
  assetClass: AssetClass;
  valuePaise: number;
  costPaise: number;
  acquiredAt: string;
  expectedReturnBps: number;
  /** Value already pledged to a lender. */
  pledgedPaise: number;
}

export interface SellRequest {
  holding: HoldingInput;
  amountPaise: number;
  months: number;
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function loanToValueBps(assetClass: AssetClass, rules: RuleValues = DEFAULT_RULES): number {
  switch (assetClass) {
    case 'equity':
    case 'hybrid':
      return rules.ltvEquityBps;
    case 'debt':
      return rules.ltvDebtBps;
    case 'fixed_deposit':
      return rules.ltvFixedDepositBps;
    case 'gold':
      return rules.ltvGoldBps;
  }
}

/** Most the member could borrow against the unpledged part of the holding. */
export function maxBorrowPaise(h: HoldingInput, rules: RuleValues = DEFAULT_RULES): number {
  return Math.max(0, Math.floor(((h.valuePaise - h.pledgedPaise) * loanToValueBps(h.assetClass, rules)) / 10_000 / 100) * 100);
}

/** Tax and penalties on selling `amount` of the holding today. */
export function saleTax(h: HoldingInput, amountPaise: number, today: string, rules: RuleValues = DEFAULT_RULES): { label: string; amountPaise: number; kind: 'tax' | 'fee' }[] {
  const held = days(h.acquiredAt, today);
  if (h.kind === 'fixed_deposit') {
    const penalty = Math.round((amountPaise * rules.fdPrematurePenaltyBps * Math.max(0, held)) / 365 / 10_000);
    return [{ label: `Early-withdrawal penalty (${formatBps(rules.fdPrematurePenaltyBps)} less interest for the time held)`, amountPaise: penalty, kind: 'fee' }];
  }
  const gain = h.valuePaise > 0 ? Math.max(0, Math.round((amountPaise * (h.valuePaise - h.costPaise)) / h.valuePaise)) : 0;
  if (gain === 0) return [{ label: 'Tax on gains (no gain on this holding)', amountPaise: 0, kind: 'tax' }];
  if (h.assetClass === 'equity' || h.assetClass === 'hybrid') {
    if (held > 365) {
      const taxable = Math.max(0, gain - rules.equityLtcgExemptionPaise);
      if (taxable === 0) return [{ label: `No tax: the ${formatInr(gain)} gain is within the ${formatInr(rules.equityLtcgExemptionPaise)} of long-term gains that are tax-free each year`, amountPaise: 0, kind: 'tax' }];
      return [{ label: `Long-term gains tax at ${formatBps(rules.equityLtcgBps)} on ${formatInr(taxable)} (first ${formatInr(rules.equityLtcgExemptionPaise)} of gains a year is tax-free)`, amountPaise: Math.round((taxable * rules.equityLtcgBps) / 10_000), kind: 'tax' }];
    }
    return [{ label: `Short-term gains tax at ${formatBps(rules.equityStcgBps)} on ${formatInr(gain)}`, amountPaise: Math.round((gain * rules.equityStcgBps) / 10_000), kind: 'tax' }];
  }
  if (h.assetClass === 'gold' && held > 730) {
    return [{ label: `Long-term gains tax at ${formatBps(rules.equityLtcgBps)} on ${formatInr(gain)}`, amountPaise: Math.round((gain * rules.equityLtcgBps) / 10_000), kind: 'tax' }];
  }
  return [{ label: `Tax on ${formatInr(gain)} of gains at your slab (assumed ${formatBps(rules.slabTaxBps)})`, amountPaise: Math.round((gain * rules.slabTaxBps) / 10_000), kind: 'tax' }];
}

/** Returns the sold amount would have earned over the months it's needed (compounded; expected, not guaranteed). */
export function lostReturnPaise(amountPaise: number, expectedReturnBps: number, months: number): number {
  return Math.round(amountPaise * ((1 + expectedReturnBps / 10_000) ** (months / 12) - 1));
}

export function sellCost(req: SellRequest, today: string, rules: RuleValues = DEFAULT_RULES): CostOption {
  const { holding: h, amountPaise, months } = req;
  const tax = saleTax(h, amountPaise, today, rules);
  const lost = lostReturnPaise(amountPaise, h.expectedReturnBps, months);
  const lines = [
    ...tax,
    { label: `Returns you’d give up over ${months} months (about ${formatBps(h.expectedReturnBps)} a year, not guaranteed)`, amountPaise: lost, kind: 'lost_return' as const },
  ];
  return { label: `Sell ${formatInr(amountPaise)} of ${h.name}`, totalCostPaise: lines.reduce((a, l) => a + l.amountPaise, 0), lines };
}

export function borrowCost(q: QuoteInput, rules: RuleValues = DEFAULT_RULES): CostOption {
  const c = emiCost(q.principalPaise, q.tenureMonths, q.ratePaBps, q.feeBps, rules.gstBps);
  return {
    label: `Borrow ${formatInr(q.principalPaise)} against it for ${q.tenureMonths} months`,
    totalCostPaise: c.totalCostPaise,
    lines: [
      { label: `Interest at ${formatBps(q.ratePaBps)} a year`, amountPaise: c.interestPaise, kind: 'interest' },
      { label: `Processing fee (${formatBps(q.feeBps)})`, amountPaise: c.processingFeePaise, kind: 'fee' },
      { label: `GST on fee (${formatBps(rules.gstBps)})`, amountPaise: c.gstOnFeePaise, kind: 'tax' },
    ],
  };
}

export interface SellVsBorrowCosts {
  sell: CostOption;
  borrow: CostOption | null;
  maxBorrowPaise: number;
  loanToValueBps: number;
  /** sell − borrow; positive means borrowing costs less. 0 when borrowing isn't possible. */
  netBenefitPaise: number;
}

export function sellVsBorrowCosts(req: SellRequest, today: string, quote: QuoteInput | null, rules: RuleValues = DEFAULT_RULES): SellVsBorrowCosts {
  const sell = sellCost(req, today, rules);
  const max = maxBorrowPaise(req.holding, rules);
  const borrow = quote && req.amountPaise <= max ? borrowCost(quote, rules) : null;
  return { sell, borrow, maxBorrowPaise: max, loanToValueBps: loanToValueBps(req.holding.assetClass, rules), netBenefitPaise: borrow ? sell.totalCostPaise - borrow.totalCostPaise : 0 };
}

/**
 * Checks, in order: signal → permission → stress → offer cap → affordability
 * (loan-to-value cap, income) → net benefit. Call with quote = null first.
 */
export function evaluateSellVsBorrow(s: MemberSnapshot, req: SellRequest, quote: QuoteInput | null, opts: { origin?: TriggerOrigin; rules?: RuleValues } = {}): EngineResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const d = new Decision('wealth_backed_liquidity', opts.origin ?? 'member_initiated');
  const h = req.holding;
  const amt = formatInr(req.amountPaise);
  const available = h.valuePaise - h.pledgedPaise;

  // 1. Signal: the member started selling an amount they hold
  if (req.amountPaise > available) {
    return d.stop('signal', 'not_eligible', `Asked for ${amt}; only ${formatInr(available)} is free to sell.`, `You can sell up to ${formatInr(available)} of ${h.name}.`);
  }
  d.pass('signal', `Member started selling ${amt} of ${h.name} for ${req.months} months.`);

  // 2. Permission → 3. Stress → 4. Offer cap
  const stop = permissionCheck(d, s, rules) ?? stressCheck(d, s, rules) ?? capCheck(d, s, rules);
  if (stop) return stop;

  // 5. Affordability: a conservative share of value, and income if verified
  const max = maxBorrowPaise(h, rules);
  const ltv = formatBps(loanToValueBps(h.assetClass, rules));
  if (req.amountPaise > max) {
    return d.stop(
      'affordability',
      'above_affordability',
      `${amt} is above the ${ltv} loan-to-value cap (${formatInr(max)}).`,
      `You can borrow up to ${formatInr(max)} against this (${ltv} of its value), less than the ${amt} you need, so selling is the way here.`,
    );
  }
  const incomeCap = s.verifiedMonthlyIncomePaise === null ? null : Math.round((s.verifiedMonthlyIncomePaise * rules.maxEmiToIncomeBps) / 10_000);
  if (!quote) {
    d.pass('affordability', `Within the ${ltv} loan-to-value cap of ${formatInr(max)}.`);
    return { kind: 'needs_quotes', principalPaise: req.amountPaise, tenureMonths: req.months };
  }
  const terms = loanTerms(quote, rules);
  if (incomeCap !== null && terms.emiPaise + s.existingEmiPaise > incomeCap) {
    return d.stop(
      'affordability',
      'above_affordability',
      `EMIs of ${formatInr(terms.emiPaise + s.existingEmiPaise)} would exceed ${formatBps(rules.maxEmiToIncomeBps)} of income.`,
      'Repaying a loan this size would stretch your monthly budget, so selling is the better route here.',
    );
  }
  d.pass('affordability', `Within the ${ltv} cap of ${formatInr(max)}${incomeCap !== null ? ' and the income cap' : ''}.`);

  // 6. Net benefit: selling costs vs borrowing costs, in rupees
  const costs = sellVsBorrowCosts(req, s.today, quote, rules);
  const borrow = costs.borrow!;
  const net = costs.netBenefitPaise;
  if (net <= 0) {
    return d.stop(
      'net_benefit',
      'no_net_benefit',
      `Selling costs ${formatInr(costs.sell.totalCostPaise)}; borrowing ${formatInr(borrow.totalCostPaise)}.`,
      `Selling costs less here (${formatInr(costs.sell.totalCostPaise)} against ${formatInr(borrow.totalCostPaise)} to borrow), so there’s nothing to save by borrowing.`,
    );
  }
  d.pass('net_benefit', `Borrowing saves ${formatInr(net)} vs selling.`);

  const saving = formatInr(net);
  const options: OfferOption[] = [
    {
      key: 'sell',
      label: costs.sell.label,
      totalCostPaise: costs.sell.totalCostPaise,
      monthlyPaise: null,
      lines: costs.sell.lines,
      acceptable: false,
      recommended: false,
      note: 'Always your choice: the money arrives in your bank account in a day or two.',
      terms: null,
    },
    {
      key: 'loan',
      label: borrow.label,
      totalCostPaise: borrow.totalCostPaise,
      monthlyPaise: terms.emiPaise,
      lines: borrow.lines,
      acceptable: true,
      recommended: true,
      note: `${quote.lenderName} holds a lien on ${h.name} until it’s repaid; your holding stays invested. Most you can borrow: ${formatInr(max)} (${ltv} of its value).`,
      terms,
    },
  ];
  const why = `You started selling ${amt} of ${h.name}. Over ${req.months} months, selling would cost ${formatInr(costs.sell.totalCostPaise)} in tax and returns you’d give up; borrowing the same amount against it costs ${formatInr(borrow.totalCostPaise)}. Selling is always your choice.`;
  return d.offer(
    net,
    {
      headline: `If you need ${amt} for ${req.months} months, borrowing against your holding costs ${saving} less than selling it`,
      subline: `${formatBps(terms.ratePaBps)} a year: ${formatInr(terms.emiPaise)} a month for ${req.months} months. Your holding stays invested.`,
      benefitLabel: 'less than selling',
      comparison: { current: costs.sell, proposed: borrow, netBenefitPaise: net },
      options,
      terms,
      trigger: { merchant: h.name, amountPaise: req.amountPaise },
      quoteRefs: { loan: quote.quoteRef },
      context: { holdingId: h.id, months: req.months },
    },
    why,
  );
}
