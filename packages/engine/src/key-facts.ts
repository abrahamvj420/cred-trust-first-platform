import { formatBps, formatInr, formatInrExact, type AcceptOptionKey, type InsuranceTerms, type KeyFactStatement, type LoanTerms } from '@cred/types';
import { aprBps } from './finance';
import { DEFAULT_RULES, type RuleValues } from './rules';

const LOAN_TYPE: Record<LoanTerms['loanKind'], string> = {
  purchase_emi: 'EMI on card purchase',
  personal_loan: 'Personal loan',
  loan_against_funds: 'Loan against your holdings',
  balance_switch_emi: 'Card balance moved to an EMI',
  repayment_plan: 'Repayment plan for your card balance',
};

/** RBI-style Key Fact Statement for a loan option, shown before acceptance. */
export function loanKeyFacts(offerId: string, option: AcceptOptionKey, t: LoanTerms, rules: RuleValues = DEFAULT_RULES, opts: { collateral?: string } = {}): KeyFactStatement {
  const upfront = t.processingFeePaise + t.gstOnFeePaise;
  const apr = aprBps(t.principalPaise, t.emiPaise, t.tenureMonths, upfront);
  const totalPayable = t.emiPaise * t.tenureMonths + upfront;
  const steps = t.rateStepDown ?? [];
  const highlights = [
    `You repay ${formatInr(t.emiPaise)} a month for ${t.tenureMonths} months to ${t.lenderName}.`,
    ...(steps.length ? [`Your rate steps down when you pay on time: ${steps.map((x) => `${formatBps(x.ratePaBps)} after ${x.afterOnTimePayments} on-time EMIs`).join(', then ')}.`] : []),
    ...(t.loanKind === 'loan_against_funds' && opts.collateral
      ? [`${t.lenderName} puts a lien on ${opts.collateral}: you can’t sell the pledged part until the loan is repaid. If its value falls a lot, the lender may ask you to repay part early.`]
      : []),
    `You can cancel within ${rules.coolingOffDays} days by repaying the amount, with no penalty.`,
  ];
  return {
    offerId,
    option,
    kind: 'loan',
    lenderOrInsurer: t.lenderName,
    items: [
      { label: 'Lender', value: t.lenderName },
      { label: 'Type', value: LOAN_TYPE[t.loanKind] },
      ...(opts.collateral ? [{ label: 'Pledged', value: opts.collateral }] : []),
      { label: 'Loan amount', value: formatInrExact(t.principalPaise) },
      { label: 'Interest rate (reducing balance)', value: `${formatBps(t.ratePaBps)} a year` },
      ...steps.map((x) => ({ label: `Rate after ${x.afterOnTimePayments} on-time EMIs`, value: `${formatBps(x.ratePaBps)} a year` })),
      { label: 'Tenure', value: `${t.tenureMonths} months` },
      { label: 'Monthly EMI', value: formatInrExact(t.emiPaise) },
      { label: 'Total interest', value: formatInrExact(t.totalInterestPaise) },
      { label: 'Processing fee', value: formatInrExact(t.processingFeePaise) },
      { label: 'GST on processing fee', value: formatInrExact(t.gstOnFeePaise) },
      { label: 'Total amount payable', value: formatInrExact(totalPayable) },
      { label: 'Annual percentage rate (APR)', value: formatBps(apr) },
      { label: 'Foreclosure charges', value: 'Nil' },
      { label: 'Cooling-off period', value: `${rules.coolingOffDays} days: cancel by repaying the principal, no penalty` },
    ],
    annualPercentageRateBps: apr,
    totalCostPaise: t.totalInterestPaise + upfront,
    coolingOffDays: rules.coolingOffDays,
    grievanceContact: `grievance@${t.lenderName.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
    highlights,
  };
}

const lakhs = (paise: number) => `₹${Number((paise / 1_00_000_00).toFixed(1))} lakh`;
const RELATION: Record<string, string> = { self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', parent_in_law: 'Parent-in-law' };

/** Key facts for an insurance option (one or more policies bought together). */
export function insuranceKeyFacts(offerId: string, option: AcceptOptionKey, policies: InsuranceTerms[]): KeyFactStatement {
  const first = policies[0]!;
  const items = policies.flatMap((p, i) => [
    { label: policies.length > 1 ? `Policy ${i + 1}` : 'Policy', value: p.productName },
    ...(p.vehicle ? [{ label: 'Vehicle', value: `${p.vehicle.makeModel} · ${p.vehicle.registration}` }, { label: 'Insured declared value', value: formatInrExact(p.vehicle.idvPaise) }] : []),
    ...(p.members.length ? [{ label: 'Who is covered', value: p.members.map((m) => `${RELATION[m.relation] ?? m.relation} (${m.age})`).join(', ') }] : []),
    { label: 'Cover', value: p.vehicle ? 'Damage to your own car, and theft' : lakhs(p.coverPaise) },
    ...(p.deductiblePaise ? [{ label: 'Pays above', value: `${lakhs(p.deductiblePaise)} of claims in a year` }] : []),
    { label: 'Yearly premium', value: formatInrExact(p.annualPremiumPaise) },
    { label: 'GST', value: p.gstPaise ? `${formatInrExact(p.gstPaise)} (included)` : '₹0 (individual health cover is GST-exempt)' },
    ...p.waitingPeriods.map((w) => ({ label: `Waiting period: ${w.label}`, value: w.detail })),
  ]);
  const total = policies.reduce((a, p) => a + p.annualPremiumPaise, 0);
  const waits = first.waitingPeriods.filter((w) => w.days > 0);
  return {
    offerId,
    option,
    kind: 'insurance',
    lenderOrInsurer: first.insurerName,
    items: [...items, { label: 'Total yearly premium', value: formatInrExact(total) }, { label: 'Free look', value: `${first.freeLookDays} days to cancel for a refund` }],
    annualPercentageRateBps: null,
    totalCostPaise: total,
    coolingOffDays: first.freeLookDays,
    grievanceContact: `care@${first.insurerName.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
    highlights: [
      `You pay ${formatInr(total)} a year to ${first.insurerName}, collected from your bank account when you confirm.`,
      ...(waits.length ? [`Cover doesn’t start for everything at once: ${waits.map((w) => `${w.label.toLowerCase()} after ${w.detail}`).join('; ')}.`] : []),
      ...(policies.some((p) => p.deductiblePaise) ? ['The top-up pays only once a year’s claims pass the amount shown, so it works alongside your base cover.'] : []),
      `You can cancel within ${first.freeLookDays} days for a refund.`,
    ],
  };
}
