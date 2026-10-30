import type { ActivitySummary } from '@cred/types';

/**
 * What a health app shares: one weekly summary, never raw days.
 * Score: 10,000 average daily steps = 100, plus credit for active days.
 */
export function summariseActivityWeek(weekStart: string, days: { steps: number }[]): ActivitySummary {
  const total = days.reduce((a, d) => a + d.steps, 0);
  const avg = days.length ? Math.round(total / days.length) : 0;
  const activeDays = days.filter((d) => d.steps >= 7_000).length;
  const score = Math.min(100, Math.round((Math.min(avg, 10_000) / 10_000) * 80 + (activeDays / 7) * 20));
  return { weekStart, avgDailySteps: avg, activeDays: Math.min(7, activeDays), score };
}
