import { addDays, rupees } from './util';
import type { PersonaFixture } from './personas';

/**
 * Someone who signs up in the app already has a life at the institutions. The
 * simulation builds it the first time it sees them, the same way as the seed.
 */

const digits = (phone: string) => [...phone].map(Number);

/** The mock bureau's score. Deterministic so a demo repeats; a number ending in 0 gets a score below the default gate. */
export function bureauScoreFor(phone: string): number {
  const sum = digits(phone).reduce((a, b) => a + b, 0);
  return phone.endsWith('0') ? 640 + (sum % 10) * 5 : 760 + (sum * 7) % 80;
}

export function signupPersona(key: string, name: string, phone: string) {
  const handle = `${name.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '') || 'member'}.${phone.slice(-4)}`;
  return { key, name, phone, city: '', age: 0, tagline: 'Signed up in the app', vpa: `${handle}@mockbank` };
}

export function signupFixture(key: string, phone: string, dob: string, today: string): PersonaFixture {
  const strong = bureauScoreFor(phone) >= 750;
  const base = {
    key,
    dob,
    panMock: `NEW${key.slice(4).toUpperCase()}Z`,
    cred: { memberSince: today, permissions: [], rewardsCoins: 0 },
  };
  if (!strong) {
    return {
      ...base,
      employer: 'Brightside Retail Pvt Ltd',
      salaryPaise: rupees(70_000),
      savingsBalancePaise: rupees(95_000),
      card: { network: 'visa', last4: phone.slice(-4), limitPaise: rupees(1_50_000), billingDay: 15, dueDay: 5, monthlySpendPaise: rupees(22_000), history: ['full', 'minimum', 'full', 'minimum', 'full', 'minimum'] },
      behaviour: { billPayHabit: 'minimum', avgDailySteps: 5_000 },
    };
  }
  return {
    ...base,
    employer: 'Harbour Systems Pvt Ltd',
    salaryPaise: rupees(1_80_000),
    savingsBalancePaise: rupees(3_00_000),
    // Six bills paid in full: enough for the Silver tier when the bank shares them
    card: { network: 'visa', last4: phone.slice(-4), limitPaise: rupees(5_00_000), billingDay: 15, dueDay: 5, monthlySpendPaise: rupees(40_000), history: ['full', 'full', 'full', 'full', 'full', 'full'] },
    behaviour: { billPayHabit: 'full', avgDailySteps: 6_500 },
    funds: [{ schemeCode: 'MER-FLEXI', units: 1_500, costPaise: rupees(1_50_000), acquiredOn: addDays(today, -500) }],
    policies: [{ productId: 'prd_group', coverPaise: rupees(3_00_000), annualPremiumPaise: 0, isEmployer: true, employerName: 'Harbour Systems Pvt Ltd', members: ['self'], renewalDate: '2027-04-01' }],
  };
}
