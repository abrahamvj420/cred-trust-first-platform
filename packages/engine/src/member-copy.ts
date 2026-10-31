import type { DecisionDraft } from './pipeline';

/**
 * Member-facing copy is supportive and non-judgmental. These words stay in
 * admin's technical reason codes and never reach the member.
 */
export const BANNED_MEMBER_WORDS = /stress|risk|blocked/i;

/** Every string from a decision that a member can see. */
export function memberFacingStrings(d: DecisionDraft): string[] {
  const out = [d.explanation];
  if (d.help) out.push(d.help.title, d.help.body);
  if (d.offer) {
    out.push(d.offer.headline, d.offer.subline);
    for (const o of d.offer.options) out.push(o.label, ...(o.note ? [o.note] : []), ...o.lines.map((l) => l.label));
  }
  return out;
}
