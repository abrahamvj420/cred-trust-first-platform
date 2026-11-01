import { DEFAULT_RULES, RULE_DEFINITIONS, type RuleKey, type RuleValues } from '@cred/engine';
import type { CredDb } from '@cred/db/cred';

/**
 * Rule settings in force: the engine defaults, overridden by what admin set
 * (stored in cred.db). Cached in memory; reloaded on change and after a reset.
 */
let current: RuleValues = { ...DEFAULT_RULES };

export const activeRules = (): RuleValues => current;

export async function loadRules(db: CredDb): Promise<RuleValues> {
  const next = { ...DEFAULT_RULES };
  for (const r of await db.ruleSetting.findMany()) {
    if (r.key in RULE_DEFINITIONS) next[r.key as RuleKey] = r.value;
  }
  current = next;
  return current;
}
