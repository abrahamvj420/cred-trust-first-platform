import type { CreditTier, FeatureKey } from '@cred/types';

/**
 * Everything the engine may look at, assembled by cred-api from cred.db.
 * The engine is pure: no I/O, no clock; `today` is the simulated date.
 */
export interface MemberSnapshot {
  memberId: string;
  today: string; // YYYY-MM-DD (sim)
  card: { limitPaise: number; outstandingPaise: number };
  /** Newest first (up to 7: the open one plus six settled). Settled statements have a payment kind; the open one has null. */
  statements: {
    periodEnd: string;
    totalDuePaise: number;
    minDuePaise: number;
    paidPaise: number;
    dueDate: string;
    paymentKind: 'full' | 'minimum' | 'custom' | null;
    onTime: boolean | null;
  }[];
  smartSavings: 'granted' | 'withdrawn' | 'never';
  /** Sim date we last asked for Smart Savings and the member didn't turn it on (null = never asked). */
  smartSavingsLastAskedOn: string | null;
  verifiedMonthlyIncomePaise: number | null;
  existingEmiPaise: number;
  ladder: { tier: CreditTier; limitPaise: number };
  offers: {
    activeOfferId: string | null;
    proactiveThisMonth: number;
    /** Triggers that already produced an offer (any status). */
    offeredTriggerRefs: string[];
    declines: { feature: FeatureKey; decidedOn: string }[];
  };
  helpThisMonth: number;
}

export interface CardPurchaseTrigger {
  transactionRef: string;
  merchant: string;
  amountPaise: number;
}

/** Indicative partner quote, priced by the lender, re-costed here with the savings method. */
export interface QuoteInput {
  quoteRef: string;
  lenderName: string;
  kind: 'purchase_emi' | 'personal_loan';
  principalPaise: number;
  tenureMonths: number;
  ratePaBps: number;
  feeBps: number;
}
