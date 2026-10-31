import { describe, expect, it } from 'vitest';
import { detectSalary } from './salary';

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const salary = (amount: number) => months.map((m) => ({ date: `${m}-01`, amountPaise: amount, kind: 'credit' as const, narration: 'SALARY LATTICE LABS PVT LTD' }));
const noise = months.flatMap((m) => [
  { date: `${m}-05`, amountPaise: -60_000_00, kind: 'debit' as const, narration: 'RENT / HOUSING' },
  { date: `${m}-14`, amountPaise: 5_000_00, kind: 'credit' as const, narration: 'UPI FROM MEERA' },
]);

describe('salary detection', () => {
  it('finds a regular monthly salary and the employer', () => {
    const f = detectSalary([...salary(2_10_000_00), ...noise]);
    expect(f).toMatchObject({ monthlyNetPaise: 2_10_000_00, employer: 'Lattice Labs Pvt Ltd', monthsVerified: 6 });
  });

  it('needs at least three months of salary credits', () => {
    expect(detectSalary(salary(1_00_000_00).slice(0, 2))).toBeNull();
    expect(detectSalary(noise)).toBeNull();
  });

  it('ignores irregular one-offs when taking the typical amount', () => {
    const s = salary(1_45_000_00);
    s[2] = { ...s[2]!, amountPaise: 3_50_000_00 }; // a bonus month
    const f = detectSalary(s)!;
    expect(f.monthlyNetPaise).toBe(1_45_000_00);
    expect(f.monthsVerified).toBe(5);
  });
});

describe('verifying salary never starts an offer', () => {
  it('records what became available', async () => {
    const { evaluateSalaryVerified } = await import('./salary');
    const { creditLine } = await import('./credit-ladder');
    const f = detectSalary([...salary(2_10_000_00), ...noise])!;
    const r = evaluateSalaryVerified(f, creditLine('gold', null, false), creditLine('gold', f.monthlyNetPaise, false));
    if (r.kind !== 'decision') throw new Error();
    expect(r.decision).toMatchObject({ feature: 'salary_verified_credit', outcome: 'available', offer: null });
    expect(r.decision.explanation).toMatch(/doesn’t start any offer/);
    const none = evaluateSalaryVerified(null, creditLine('gold', null, false), null);
    if (none.kind !== 'decision') throw new Error();
    expect(none.decision).toMatchObject({ outcome: 'blocked', reasons: ['not_eligible'], offer: null });
  });
});
