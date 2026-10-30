import { rupees } from '../util';
import type { PersonaFixture } from './types';

export type { PersonaFixture, PayPlan } from './types';

const full = (n: number) => Array.from({ length: n }, () => 'full' as const);

/** Golden path hero: healthy, pays in full, no Smart Savings yet. Features 1, 2, 3, 5, 7. */
const aarav: PersonaFixture = {
  key: 'aarav',
  dob: '1994-03-18',
  panMock: 'AAAPM1234A',
  employer: 'Lattice Labs Pvt Ltd',
  salaryPaise: rupees(2_10_000),
  savingsBalancePaise: rupees(3_40_000),
  card: { network: 'visa', last4: '4821', limitPaise: rupees(4_00_000), billingDay: 15, dueDay: 5, monthlySpendPaise: rupees(45_000), history: full(14) },
  behaviour: { billPayHabit: 'full', avgDailySteps: 6_500 },
  funds: [
    { schemeCode: 'MER-FLEXI', units: 4_862.4, costPaise: rupees(3_20_000), acquiredOn: '2023-06-12' },
    { schemeCode: 'MER-N50', units: 5_984.25, costPaise: rupees(1_55_000), acquiredOn: '2024-02-05' },
  ],
  policies: [
    { productId: 'prd_group', coverPaise: rupees(5_00_000), annualPremiumPaise: 0, isEmployer: true, employerName: 'Lattice Labs Pvt Ltd', members: ['self'], renewalDate: '2027-04-01' },
  ],
  cred: { memberSince: '2022-08-10', permissions: [], rewardsCoins: 48_250 },
};

/** Family protection: employer cover plus a CRED-bought floater; parents uncovered. Features 4, 6. */
const priya: PersonaFixture = {
  key: 'priya',
  dob: '1988-07-02',
  panMock: 'BBBPN5678B',
  employer: 'Coastline Logistics Ltd',
  salaryPaise: rupees(1_45_000),
  savingsBalancePaise: rupees(1_85_000),
  card: { network: 'mastercard', last4: '7710', limitPaise: rupees(2_50_000), billingDay: 15, dueDay: 5, monthlySpendPaise: rupees(38_000), history: full(7) },
  behaviour: { billPayHabit: 'full', avgDailySteps: 8_200 },
  policies: [
    { productId: 'prd_group', coverPaise: rupees(3_00_000), annualPremiumPaise: 0, isEmployer: true, employerName: 'Coastline Logistics Ltd', members: ['self', 'spouse', 'child'], renewalDate: '2027-01-01' },
    { productId: 'prd_floater', coverPaise: rupees(5_00_000), annualPremiumPaise: rupees(18_600), isEmployer: false, members: ['self', 'spouse', 'child'], renewalDate: '2026-11-25', viaCred: true },
  ],
  family: [
    { name: 'Arjun Nair', relation: 'spouse', age: 41, knownToCred: true },
    { name: 'Diya Nair', relation: 'child', age: 9, knownToCred: true },
    { name: 'Gopal Menon', relation: 'parent', age: 68, knownToCred: false },
    { name: 'Lakshmi Menon', relation: 'parent', age: 64, knownToCred: false },
  ],
  wearable: { provider: 'health_connect' },
  cred: {
    memberSince: '2023-01-22',
    permissions: [
      { scope: 'smart_savings', context: 'Health cover renewal reminder', grantedOn: '2025-11-10' },
      { scope: 'health_data', context: 'Wellness rewards on family floater', grantedOn: '2025-11-12' },
    ],
    rewardsCoins: 21_900,
  },
};

/** Wealth-heavy: FDs, funds, gold; saving for a house. Features 2, 7. */
const sneha: PersonaFixture = {
  key: 'sneha',
  dob: '1981-11-27',
  panMock: 'CCCPK9012C',
  employer: 'Indus Advisory LLP',
  salaryPaise: rupees(3_20_000),
  savingsBalancePaise: rupees(4_60_000),
  card: { network: 'visa', last4: '3094', limitPaise: rupees(6_00_000), billingDay: 15, dueDay: 5, monthlySpendPaise: rupees(80_000), history: full(26) },
  behaviour: { billPayHabit: 'full', avgDailySteps: 7_100 },
  fixedDeposits: [
    { principalPaise: rupees(8_00_000), ratePaBps: 710, openedOn: '2025-04-01', maturesOn: '2027-04-01' },
    { principalPaise: rupees(5_00_000), ratePaBps: 725, openedOn: '2026-01-15', maturesOn: '2028-01-15' },
  ],
  funds: [
    { schemeCode: 'MER-FLEXI', units: 7_708.7, costPaise: rupees(4_90_000), acquiredOn: '2021-09-20' },
    { schemeCode: 'MER-SDUR', units: 10_752.7, costPaise: rupees(2_80_000), acquiredOn: '2024-07-01' },
  ],
  goldGrams: { grams: 40, costPaise: rupees(2_40_000), acquiredOn: '2023-10-24' },
  policies: [
    { productId: 'prd_group', coverPaise: rupees(10_00_000), annualPremiumPaise: 0, isEmployer: true, employerName: 'Indus Advisory LLP', members: ['self'], renewalDate: '2027-04-01' },
  ],
  cred: {
    memberSince: '2020-02-14',
    permissions: [
      { scope: 'smart_savings', context: 'Card bill savings', grantedOn: '2024-03-02' },
      { scope: 'portfolio_data', context: 'Linked portfolio for tracking', grantedOn: '2025-06-18' },
    ],
    portfolioLinked: true,
    goals: [{ name: 'House down payment', targetPaise: rupees(30_00_000), targetDate: '2027-12-31', assumedReturnBps: 900 }],
    rewardsCoins: 1_12_400,
  },
};

/** Newer member; one partial bill after his wedding, otherwise healthy. Features 3, 5, 8. */
const kabir: PersonaFixture = {
  key: 'kabir',
  dob: '1997-05-09',
  panMock: 'DDDPS3456D',
  employer: 'Brightpath EdTech Pvt Ltd',
  salaryPaise: rupees(95_000),
  savingsBalancePaise: rupees(62_000),
  card: {
    network: 'rupay',
    last4: '5562',
    limitPaise: rupees(1_50_000),
    billingDay: 15,
    dueDay: 5,
    monthlySpendPaise: rupees(28_000),
    history: ['full', 'full', 'full', 'full', { pct: 60 }, 'full'],
    oneOffs: [
      { cycle: 4, merchant: 'Royal Banquets', category: 'other', amountPaise: rupees(42_000) },
      { cycle: 6, merchant: 'SkyHop Airlines', category: 'travel', amountPaise: rupees(36_000) },
    ],
  },
  behaviour: { billPayHabit: 'full', avgDailySteps: 9_400 },
  funds: [{ schemeCode: 'MER-N50', units: 1_102.4, costPaise: rupees(30_000), acquiredOn: '2025-08-01' }],
  cred: {
    memberSince: '2025-04-03',
    permissions: [{ scope: 'smart_savings', context: 'Card bill savings', grantedOn: '2025-04-03' }],
    rewardsCoins: 6_300,
  },
};

/** Under stress: high utilisation, minimum-only payments, falling balance. Gets help, not credit. */
const rohan: PersonaFixture = {
  key: 'rohan',
  dob: '1999-01-30',
  panMock: 'EEEPD7890E',
  employer: 'QuickServe Foods Pvt Ltd',
  salaryPaise: rupees(48_000),
  savingsBalancePaise: rupees(6_200),
  card: {
    network: 'visa',
    last4: '9013',
    limitPaise: rupees(1_00_000),
    billingDay: 15,
    dueDay: 5,
    monthlySpendPaise: rupees(20_000),
    openingCarryPaise: rupees(42_000),
    history: ['full', { pct: 50 }, { pct: 40 }, 'minimum', 'minimum'],
  },
  behaviour: { billPayHabit: 'minimum', avgDailySteps: 4_300 },
  cred: {
    memberSince: '2024-09-19',
    permissions: [{ scope: 'smart_savings', context: 'Card bill savings', grantedOn: '2024-09-19' }],
    rewardsCoins: 2_150,
  },
};

export const PERSONA_FIXTURES: readonly PersonaFixture[] = [aarav, priya, sneha, kabir, rohan];
