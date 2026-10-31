import { z } from 'zod';

export const FeatureKey = z.enum([
  'big_spend_support', // 1
  'wealth_backed_liquidity', // 2
  'earned_credit_ladder', // 3
  'family_health_insurance', // 4
  'salary_verified_credit', // 5
  'protection_gap', // 6
  'wealth_management', // 7
  'card_balance_switch', // 8
]);
export type FeatureKey = z.infer<typeof FeatureKey>;

export const Pillar = z.enum(['borrow_better', 'protect', 'grow']);
export type Pillar = z.infer<typeof Pillar>;

export const FEATURE_PILLAR: Record<FeatureKey, Pillar> = {
  big_spend_support: 'borrow_better',
  wealth_backed_liquidity: 'borrow_better',
  earned_credit_ladder: 'borrow_better',
  salary_verified_credit: 'borrow_better',
  card_balance_switch: 'borrow_better',
  family_health_insurance: 'protect',
  protection_gap: 'protect',
  wealth_management: 'grow',
};

export const PermissionScope = z.enum(['smart_savings', 'income_data', 'health_data', 'portfolio_data']);
export type PermissionScope = z.infer<typeof PermissionScope>;

export const PermissionStatus = z.enum(['granted', 'withdrawn']);

/** How an engine run was started. Member-initiated requests need no Smart Savings permission. */
export const TriggerOrigin = z.enum(['proactive', 'member_initiated']);
export type TriggerOrigin = z.infer<typeof TriggerOrigin>;

export const OfferStatus = z.enum(['awaiting_permission', 'shown', 'accepted', 'declined', 'expired']);
export type OfferStatus = z.infer<typeof OfferStatus>;

export const DecisionOutcome = z.enum(['offer', 'blocked', 'help']);
export type DecisionOutcome = z.infer<typeof DecisionOutcome>;

export const EngineCheck = z.enum(['signal', 'permission', 'stress', 'offer_cap', 'affordability', 'likely_to_carry', 'net_benefit']);
export type EngineCheck = z.infer<typeof EngineCheck>;

export const ReasonCode = z.enum([
  'ok',
  'no_permission',
  'stress_signal',
  'no_net_benefit',
  'above_affordability',
  'active_offer_exists',
  'monthly_cap_reached',
  'not_eligible',
  'no_signal',
  'recently_declined',
  'already_offered',
  'awaiting_permission',
  'can_pay_in_full',
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const StressSignal = z.enum([
  'partial_payments',
  'missed_payment',
  'minimum_only_payments',
  'high_utilisation',
  'falling_balance',
]);
export type StressSignal = z.infer<typeof StressSignal>;

export const TxnCategory = z.enum([
  'electronics',
  'travel',
  'groceries',
  'dining',
  'fuel',
  'utilities',
  'shopping',
  'health',
  'education',
  'entertainment',
  'other',
]);
export type TxnCategory = z.infer<typeof TxnCategory>;

export const BillPaymentKind = z.enum(['full', 'minimum', 'custom']);
export const StatementStatus = z.enum(['open', 'paid', 'partial', 'unpaid', 'overdue']);

export const HoldingKind = z.enum(['mutual_fund', 'fixed_deposit', 'gold']);
export type HoldingKind = z.infer<typeof HoldingKind>;

export const PolicyKind = z.enum(['health_individual', 'health_family_floater', 'employer_group_health', 'term_life']);
export const ClaimStatus = z.enum(['filed', 'documents_pending', 'under_review', 'approved', 'settled', 'rejected']);

export const LoanKind = z.enum(['purchase_emi', 'personal_loan', 'loan_against_funds', 'balance_switch_emi']);
export const LoanStatus = z.enum(['quoted', 'applied', 'approved', 'declined', 'disbursed', 'closed']);
export const InstallmentStatus = z.enum(['upcoming', 'paid', 'overdue']);

export const AaFiType = z.enum(['DEPOSIT', 'TERM_DEPOSIT', 'MUTUAL_FUNDS', 'INSURANCE_POLICIES']);
export type AaFiType = z.infer<typeof AaFiType>;
export const AaConsentStatus = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED']);
export const AaPurpose = z.enum(['income_verification', 'portfolio_tracking', 'protection_review']);
export type AaPurpose = z.infer<typeof AaPurpose>;

export const UpiStatus = z.enum(['awaiting_pin', 'success', 'failed']);
export const GatewayPaymentStatus = z.enum(['created', 'requires_authentication', 'succeeded', 'failed']);
export const PaymentMethod = z.enum(['card', 'upi']);

export const Relation = z.enum(['self', 'spouse', 'child', 'parent', 'parent_in_law']);
export type Relation = z.infer<typeof Relation>;

export const WearableProvider = z.enum(['apple_health', 'health_connect']);

export const CreditTier = z.enum(['starter', 'silver', 'gold', 'platinum']);
export type CreditTier = z.infer<typeof CreditTier>;

export const AuditActor = z.enum(['member', 'admin', 'system', 'partner']);

export const Partner = z.enum(['bank', 'gateway', 'upi', 'aa', 'lender', 'insurer', 'fundhouse', 'wearable', 'sim']);
export type Partner = z.infer<typeof Partner>;

export const PersonaKey = z.enum(['aarav', 'priya', 'sneha', 'kabir', 'rohan']);
export type PersonaKey = z.infer<typeof PersonaKey>;

export const Scenario = z.enum(['big_purchase', 'partial_bill_payment', 'fund_sale', 'insurer_renewal', 'wearable_sync']);
export type Scenario = z.infer<typeof Scenario>;
