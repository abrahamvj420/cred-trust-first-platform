import { wellnessReward } from '@cred/engine';
import { ecosystemApi } from '@cred/types';
import type { Ctx } from './context';
import { activeRules } from './rules';

/**
 * With the member's health-data permission, CRED shares one number with the
 * insurer of a floater bought through CRED: the average weekly activity score.
 * The insurer applies the reward itself at renewal.
 */
export async function shareWellnessScore(ctx: Ctx, memberId: string): Promise<void> {
  const { db } = ctx;
  const perm = await db.permission.findUnique({ where: { memberId_scope: { memberId, scope: 'health_data' } } });
  if (perm?.status !== 'granted') return;
  const floater = await db.insurancePolicy.findFirst({ where: { memberId, source: 'cred_purchase', kind: 'health_family_floater', status: 'active' } });
  if (!floater) return;
  const weeks = await db.activitySummary.findMany({ where: { memberId }, orderBy: { weekStart: 'desc' }, take: 4 });
  const { averageScore } = wellnessReward(floater.annualPremiumPaise, weeks.map((w) => w.score), 10, activeRules());
  if (averageScore === null) return;
  await ctx.partner(ecosystemApi.insurer.wellness, { params: { policyRef: floater.externalRef }, body: { score: averageScore, weeks: weeks.length } }).catch((e) => ctx.log.warn({ err: String(e) }, 'wellness score share failed'));
}
