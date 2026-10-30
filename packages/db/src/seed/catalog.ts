import type { TxnCategory } from '@cred/types';
import { rupees } from './util';

/**
 * The fixed outside world: institutions, products and merchants. All names
 * are fictional.
 */

export const BANK = { name: 'Mock Bank', ifsc: 'MOCK0000101', vpaSuffix: 'mockbank' } as const;

export const SHOPKART = { name: 'ShopKart', category: 'electronics', vpa: 'shopkart@mockbank' } as const;

export const LENDERS = [
  { id: 'lnd_northstar', name: 'Northstar Finance', ratePaBps: 1600, feeBps: 100, maxTenure: 36, maxFoirBps: 5000 },
  { id: 'lnd_banyan', name: 'Banyan Credit', ratePaBps: 1800, feeBps: 100, maxTenure: 24, maxFoirBps: 4500 },
] as const;

/** Annual premium per ₹1L of cover, by the oldest member's age. */
const floaterRates = [
  { maxAge: 35, paise: rupees(2_400) },
  { maxAge: 45, paise: rupees(3_100) },
  { maxAge: 60, paise: rupees(5_200) },
  { maxAge: 120, paise: rupees(9_800) },
];
const topUpRates = [
  { maxAge: 35, paise: rupees(450) },
  { maxAge: 45, paise: rupees(650) },
  { maxAge: 60, paise: rupees(1_200) },
  { maxAge: 120, paise: rupees(2_600) },
];

export const INSURER = {
  id: 'ins_sahaj',
  name: 'Sahaj Health Insurance',
  products: [
    { id: 'prd_floater', name: 'Sahaj Family Floater', kind: 'family_floater', rates: floaterRates, wellnessRewardMaxPct: 10 },
    { id: 'prd_topup', name: 'Sahaj Super Top-Up', kind: 'super_top_up', rates: topUpRates, wellnessRewardMaxPct: 0 },
    { id: 'prd_group', name: 'Sahaj Group Health (Employer)', kind: 'employer_group_health', rates: floaterRates, wellnessRewardMaxPct: 0 },
  ],
} as const;

export const FUND_HOUSE = {
  id: 'amc_meridian',
  name: 'Meridian Mutual Fund',
  schemes: [
    { code: 'MER-FLEXI', name: 'Meridian Flexi Cap Fund – Direct Growth', category: 'equity', navPaise: rupees(84.32), expenseRatioBps: 62, exitLoadBps: 100, expectedReturnBps: 1200 },
    { code: 'MER-N50', name: 'Meridian Nifty 50 Index Fund – Direct Growth', category: 'equity', navPaise: rupees(31.75), expenseRatioBps: 18, exitLoadBps: 0, expectedReturnBps: 1150 },
    { code: 'MER-SDUR', name: 'Meridian Short Duration Fund – Direct Growth', category: 'debt', navPaise: rupees(27.9), expenseRatioBps: 35, exitLoadBps: 0, expectedReturnBps: 720 },
    { code: 'MER-GOLD', name: 'Meridian Gold Fund – Direct Growth', category: 'gold', navPaise: rupees(24.6), expenseRatioBps: 15, exitLoadBps: 0, expectedReturnBps: 900 },
  ],
} as const;

export const GOLD_PRICE_PER_GRAM_PAISE = rupees(7_850);

/** People and shops you can pay by UPI who aren't seeded personas. */
export const OTHER_VPAS = [
  { handle: SHOPKART.vpa, name: 'ShopKart' },
  { handle: 'ramesh.tea@mockbank', name: 'Ramesh Tea Stall' },
  { handle: 'suresh.iyer@mockbank', name: 'Suresh Iyer (Landlord)' },
  { handle: 'meera.joshi@mockbank', name: 'Meera Joshi' },
  { handle: 'freshbasket@mockbank', name: 'FreshBasket Groceries' },
] as const;

/** Merchants used to generate card spend history. */
export const SPEND_MERCHANTS: { merchant: string; category: TxnCategory; weight: number }[] = [
  { merchant: 'FreshBasket', category: 'groceries', weight: 5 },
  { merchant: 'Urban Bistro', category: 'dining', weight: 3 },
  { merchant: 'FuelPoint', category: 'fuel', weight: 2 },
  { merchant: 'PowerGrid Electricity', category: 'utilities', weight: 1 },
  { merchant: 'StreamBox', category: 'entertainment', weight: 1 },
  { merchant: 'ShopKart', category: 'shopping', weight: 2 },
  { merchant: 'CareWell Pharmacy', category: 'health', weight: 1 },
  { merchant: 'SkyHop Airlines', category: 'travel', weight: 1 },
];
