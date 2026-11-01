import { conflict, handlers, notFound, requireEnv } from '@cred/service-kit';
import { call, credApi, ecosystemApi, type MemberAction } from '@cred/types';
import type { Ctx } from './context';
import { issueToken } from './session';

const NOTES: Record<MemberAction, string> = {
  partial_bill_payment: 'Paid 40% of the bill in CRED (Card-Balance Switch looks at the rest).',
  fund_sale: 'Started selling 30% of the largest fund for 12 months (sell vs borrow).',
  verify_salary: 'Started salary verification and approved it on SimAA (salary-verified credit).',
  link_portfolio: 'Linked funds and deposits through SimAA (wealth management).',
  link_policies: 'Linked policies through SimAA (protection gap check).',
  add_parents: 'Added both parents and asked the insurer for a ₹5 lakh floater comparison.',
  connect_wearable: 'Allowed weekly activity summaries from Health Connect (wellness rewards).',
};

/**
 * Control room only (DEMO_MODE): do what a member would do in the app, through
 * cred-api's own public endpoints with that member's session, so every rule applies.
 */
export function simHandlers(ctx: Ctx, h: ReturnType<typeof handlers>) {
  const { db } = ctx;
  const self = () => requireEnv('CRED_API_URL');

  h.on(credApi.platform.simMemberAction, async ({ body }) => {
    const m = await db.member.findUnique({ where: { personaKey: body.personaKey } });
    if (!m || m.deletedAt) throw notFound('Member');
    const headers = { authorization: `Bearer ${issueToken({ memberId: m.id, personaKey: body.personaKey, issuedAt: new Date().toISOString() })}` };
    const asMember = <E extends Parameters<typeof call>[1]>(e: E, input: Parameters<typeof call<E>>[2] = {}) => call(self(), e, { ...input, headers });
    const approve = async () => {
      await ctx.partner(ecosystemApi.sim.approveConsents, { body: { personaKey: body.personaKey } });
    };

    switch (body.action) {
      case 'partial_bill_payment': {
        const card = (await asMember(credApi.member.cards)).cards[0];
        const due = card?.nextDue;
        if (!card || !due || due.remainingPaise <= 0) throw conflict('nothing_due', 'No bill to pay part of');
        const amountPaise = Math.max(due.minDuePaise, Math.round((due.remainingPaise * 0.4) / 100) * 100);
        await asMember(credApi.member.payBill, { params: { cardId: card.id }, body: { kind: 'custom', amountPaise, source: 'upi' } });
        break;
      }
      case 'fund_sale': {
        const fund = (await asMember(credApi.products.holdings)).holdings.filter((x) => x.kind === 'mutual_fund' && !x.pledged).sort((a, b) => b.valuePaise - a.valuePaise)[0];
        if (!fund) throw conflict('no_funds', 'No linked funds to sell; link a portfolio first');
        await asMember(credApi.products.sellIntent, { body: { holdingId: fund.id, amountNeededPaise: Math.round((fund.valuePaise * 0.3) / 100_00) * 100_00, months: 12 } });
        break;
      }
      case 'verify_salary':
      case 'link_portfolio':
      case 'link_policies': {
        const purpose = body.action === 'verify_salary' ? 'income_verification' : body.action === 'link_portfolio' ? 'portfolio_tracking' : 'protection_review';
        await asMember(credApi.member.startAaConsent, { body: { purpose, returnTo: '/' } });
        await approve();
        break;
      }
      case 'add_parents': {
        const family = (await asMember(credApi.products.family)).family;
        let parents = family.filter((f) => f.relation === 'parent');
        if (!parents.length) {
          for (const p of [
            { name: 'Ramesh Kumar', relation: 'parent' as const, age: 66 },
            { name: 'Sunita Kumar', relation: 'parent' as const, age: 61 },
          ]) {
            parents.push((await asMember(credApi.products.addFamilyMember, { body: p })).member);
          }
        }
        parents = parents.slice(0, 2);
        await asMember(credApi.products.healthQuote, { body: { coverPaise: 5_00_000_00, familyMemberIds: parents.map((p) => p.id) } });
        break;
      }
      case 'connect_wearable': {
        await asMember(credApi.member.grantPermission, { body: { scope: 'health_data', context: 'Wellness rewards via Google Health Connect', explicit: true } });
        await asMember(credApi.products.linkWearable, { body: { provider: 'health_connect' } });
        break;
      }
    }
    await ctx.audit({ memberId: m.id, actor: 'admin', action: 'demo.member_action', target: body.action, details: { note: 'Control room acted for the member (DEMO_MODE)' } });
    return { action: body.action, personaKey: body.personaKey, note: NOTES[body.action] };
  });
}
