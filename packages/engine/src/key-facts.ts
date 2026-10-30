import { formatBps, formatInrExact, type KeyFactStatement, type LoanTerms } from '@cred/types';
import { COOLING_OFF_DAYS } from './constants';
import { aprBps } from './finance';

/** RBI-style Key Fact Statement for a loan option, shown before acceptance. */
export function loanKeyFacts(offerId: string, option: 'emi' | 'loan', t: LoanTerms): KeyFactStatement {
  const upfront = t.processingFeePaise + t.gstOnFeePaise;
  const apr = aprBps(t.principalPaise, t.emiPaise, t.tenureMonths, upfront);
  const totalPayable = t.emiPaise * t.tenureMonths + upfront;
  return {
    offerId,
    option,
    lenderOrInsurer: t.lenderName,
    items: [
      { label: 'Lender', value: t.lenderName },
      { label: 'Type', value: t.loanKind === 'purchase_emi' ? 'EMI on card purchase' : 'Personal loan' },
      { label: 'Loan amount', value: formatInrExact(t.principalPaise) },
      { label: 'Interest rate (reducing balance)', value: `${formatBps(t.ratePaBps)} a year` },
      { label: 'Tenure', value: `${t.tenureMonths} months` },
      { label: 'Monthly EMI', value: formatInrExact(t.emiPaise) },
      { label: 'Total interest', value: formatInrExact(t.totalInterestPaise) },
      { label: 'Processing fee', value: formatInrExact(t.processingFeePaise) },
      { label: 'GST on processing fee', value: formatInrExact(t.gstOnFeePaise) },
      { label: 'Total amount payable', value: formatInrExact(totalPayable) },
      { label: 'Annual percentage rate (APR)', value: formatBps(apr) },
      { label: 'Foreclosure charges', value: 'Nil' },
      { label: 'Cooling-off period', value: `${COOLING_OFF_DAYS} days: cancel by repaying the principal, no penalty` },
    ],
    annualPercentageRateBps: apr,
    totalCostPaise: t.totalInterestPaise + upfront,
    coolingOffDays: COOLING_OFF_DAYS,
    grievanceContact: `grievance@${t.lenderName.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
  };
}
