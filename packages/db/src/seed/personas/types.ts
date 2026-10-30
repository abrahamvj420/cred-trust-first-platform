import type { PermissionScope, PersonaKey, Relation } from '@cred/types';

/** How a month's card bill was paid. */
export type PayPlan = 'full' | 'minimum' | { pct: number };

/**
 * Everything about one persona. The world builder derives history from this;
 * the ecosystem seeder writes all of it, the CRED seeder only what CRED would
 * legitimately have received.
 */
export interface PersonaFixture {
  key: PersonaKey;
  dob: string;
  panMock: string;
  employer: string;
  salaryPaise: number;
  savingsBalancePaise: number;
  card: {
    network: 'visa' | 'mastercard' | 'rupay';
    last4: string;
    limitPaise: number;
    billingDay: 15;
    dueDay: 5;
    /** Typical new spend per cycle. */
    monthlySpendPaise: number;
    /** Revolving balance carried into the oldest statement. */
    openingCarryPaise?: number;
    /** Oldest → newest settled statements. The newest statement is left open (unpaid). */
    history: PayPlan[];
    /** A big one-off in a given cycle, e.g. wedding costs. Index into history. */
    oneOffs?: { cycle: number; merchant: string; category: 'shopping' | 'travel' | 'other'; amountPaise: number }[];
  };
  /** Script for clock advances in the simulation. */
  behaviour: { billPayHabit: 'full' | 'minimum' | `partial_pct:${number}`; avgDailySteps: number };
  fixedDeposits?: { principalPaise: number; ratePaBps: number; openedOn: string; maturesOn: string }[];
  funds?: { schemeCode: string; units: number; costPaise: number; acquiredOn: string }[];
  goldGrams?: { grams: number; costPaise: number; acquiredOn: string };
  policies?: {
    productId: 'prd_floater' | 'prd_topup' | 'prd_group';
    coverPaise: number;
    annualPremiumPaise: number;
    isEmployer: boolean;
    employerName?: string;
    members: Relation[];
    renewalDate: string | null;
    /** Bought through CRED, so CRED already knows it. */
    viaCred?: boolean;
  }[];
  family?: { name: string; relation: Relation; age: number; knownToCred: boolean }[];
  wearable?: { provider: 'apple_health' | 'health_connect' };
  cred: {
    memberSince: string;
    permissions: { scope: PermissionScope; context: string; grantedOn: string }[];
    /** An ACTIVE AA portfolio consent exists and holdings were pulled. */
    portfolioLinked?: boolean;
    goals?: { name: string; targetPaise: number; targetDate: string; assumedReturnBps: number }[];
    rewardsCoins: number;
  };
}
