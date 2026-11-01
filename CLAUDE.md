# CLAUDE.md

Context for Claude Code sessions in this repo. **This file is the contract for every session.** Read it in full before writing code, and update it when a decision changes.

## Project

Class prototype for **Business in the Digital Age (SPJIMR)**, built around CRED: a **fully simulated fintech ecosystem** around CRED that behaves like real life.

- All data is **synthetic**. No real APIs, payments or personal data, ever.
- Built solo with Claude, on a short timeline (originally 2 days). Favour a working, polished demo over production completeness. Mock freely, but keep the business logic honest.
- No CRED logos or trademarks.

## Architecture

pnpm + Turborepo monorepo, **TypeScript everywhere**.

```
apps/
  cred        Next.js (App Router) + Tailwind: CRED member app, mobile-first, premium dark design
  admin       Next.js: CRED internal console (ops, risk, privacy logs) + "Demo control room" tab
  shop        Next.js: "ShopKart", a demo merchant store with card and UPI checkout
  ecosystem   Next.js: outside-world screens, each with its own branding and route: Mock Bank
              (card OTP, statements, salary credits), UPI PIN page, Account Aggregator consent
              page, insurer, fund house, lender and health-app pages
services/
  cred-api        Fastify + TS: CRED's real backend. Ingests transactions, runs the offer engine,
                  permissions, audit log, real-time push to the member app (server-sent events)
  ecosystem-api   Fastify + TS: one service with namespaces /bank, /gateway, /upi, /aa, /lender,
                  /insurer, /fundhouse, /wearable. Talks to cred-api only through signed webhooks
                  and REST, like real partners
packages/
  types     shared Zod schemas and TS types for every API request/response and every webhook
            event: the single source of truth
  engine    offer engine + 8 feature modules, pure TS, unit tested with Vitest
  db        Prisma + SQLite, separate databases per service (cred.db, ecosystem.db), schemas
            and seed personas
  ui        shared components + one theme file per brand (cred, admin, shopkart, mockbank,
            upi, aa, insurer, fundhouse, lender, health)
  service-kit  Fastify plumbing shared by both services: routes only from contracts
            (svc.implement; unimplemented contract endpoints answer 501), Zod validation of
            requests and responses, /status, the DEMO_MODE guard on auth:'demo' endpoints
scripts/check-boundaries.ts   run by `pnpm test`; fails on rule violations (below)
tests/e2e/                    `pnpm test:e2e`: starts its own cred-api + ecosystem-api on ports 4900/4910
                              with throwaway databases (never touches dev data; no `pnpm dev` needed)
```

## Conventions (decided in M1)

- Money is integer **paise** everywhere; rates are integer **basis points**. Format only at the UI edge with `formatInr` from `@cred/types`.
- SQLite fields for enums and JSON are `String`, validated by the Zod enums/schemas in `@cred/types`.
- Webhooks: envelope `{ id, type, partner, occurredAt, data }`, HMAC-SHA256 over `timestamp.body` (`x-sim-signature`, `x-sim-timestamp`), 5-minute replay window, idempotent by event id.
- ecosystem-api owns the simulated clock; cred-api mirrors it from `sim.clock.advanced`.
- Seed: `pnpm seed` runs `prisma db push` then wipes and refills rows. Deterministic IDs (`mem_aarav`, `per_aarav`, …). Never pass `--accept-data-loss` from an agent; Prisma blocks it and the user must decide.
- Engine check order (every evaluated check is saved on the decision, offer or not): signal → permission → stress → offer cap → affordability → likely to carry → net benefit. Engine is pure: cred-api builds a `MemberSnapshot`, calls the feature, fetches partner quotes only if asked, calls again. Affordability is re-checked against the actual quotes.
- **Rule settings** live in `packages/engine/src/rules.ts` (`RULE_DEFINITIONS`): every threshold, cap and rate. Engine functions take `rules` (default `DEFAULT_RULES`); `constants.ts` derives the savings-method numbers from them. Admin edits them live at `/rules` (M6: validated ranges, every change logged).
- **Likely to carry**: projected next bill (outstanding minus the open bill due first) vs capacity = typical repayment (last 6 settled) × `carryRepaymentMultipleBps`, or typical repayment + monthly surplus if salary is shared, whichever is higher. Not likely → no proactive offer, logged `can_pay_in_full`; the member can still tap "Convert to EMI" (member-initiated).
- **Conditional wording**: offer headlines and the Smart Savings card say "If you can’t clear ₹X by the due date, an EMI saves you ₹Y compared with carrying it". Never an unconditional saving claim. "Pay the full bill: ₹0" is always the first option.
- **Member-initiated** (Convert to EMI): no Smart Savings needed, no monthly cap or cooldown, skips likely-to-carry; stress, one-active-offer, affordability and net benefit still apply.
- **Explainability**: every decision stores a plain-English `explanation` (offers carry it as `why`). The member sees it ("Why am I seeing this?" and the "why we did or didn't suggest something" feed); admin shows it next to the technical check details.
- Property tests (fast-check, `packages/engine/src/properties.test.ts`) guard: no offer with a non-positive saving, no credit to a stressed member, no offer above affordability, no proactive offer to a likely full payer.
- Smart Savings: if never asked, the engine still evaluates and saves the offer as `awaiting_permission`; the app shows the one-time permission card with the offer's conditional headline. "Not now" declines that offer; Smart Savings is not asked again for `permissionReaskDays` (90). Withdrawal stops proactive offers immediately: open ones expire (logged) and the engine blocks with `no_permission`.
- Offers show every option side by side, including "pay in full: ₹0" for honesty. Net benefit is measured against keeping it on the card for 12 months (the savings method).
- "No thanks" is final for that trigger, and the same feature stays quiet for 30 sim days. One active offer; at most 3 proactive offers per sim month.
- Lender quotes are anonymous (no member data). Member details go to the lender only when they accept, after the key-fact screen; the lender then sends an e-sign OTP.
- Demo OTPs: any 6 digits are accepted; the real demo code is shown on screen.
- Rohan's limit is ₹2.5L so a ₹1.5L purchase can clear the bank; it takes him to ~96% utilisation (stress).
- Kabir's part-paid wedding bill sits outside the 3-statement stress lookback, so one new part payment doesn't read as a pattern (Card-Balance Switch demo). Priya is 2 in-full bills from Gold (ladder demo) and her policies are linked through AA (protection demo).
- Pinned versions: pnpm 10, TypeScript 5.9 (not 7), Prisma 7.10.1, Next 16, Zod 4, Vitest 4.

## Non-negotiable rules

- **Contracts first.** No endpoint or webhook exists without its schema in `packages/types`. Validate every request and webhook with Zod on both sides.
- **Front-ends call only their own API**, never a database or the engine directly. (`check-boundaries` enforces this, the database split, contract-only routes, the /sim exception and theme-only styling.)
- **CRED never reads the ecosystem database.** Data reaches CRED only through webhooks or consented pulls (Account Aggregator), as in real life.
- **Each app uses only its own brand theme** from `packages/ui`. No ad-hoc colours or fonts.
- **Polish priority:** the CRED app and the core flow get full polish; ShopKart looks like a real store; admin and ecosystem screens look credible and clean.
- `pnpm dev` starts everything, each on a fixed port (listed in README). `pnpm seed` resets all data to the demo personas. `pnpm demo` (M7) is the documented way to start a demo.
- **The one exception (control room):** admin's Demo tab may call each service's `/status` and `/sim/*` endpoints directly, **only when `DEMO_MODE=true`**. No real app flow may ever call `/sim/*`; services reject `/sim/*` when `DEMO_MODE` is not `true`.
- `pnpm test:e2e` runs the golden-path integration test across all services. **It must pass after every milestone** (from M2 onward).

## Core idea

One **shared offer engine** that every product feature goes through. Every offer must pass three checks, in this order:

1. **Permission given**: the member asked for it, or has granted Smart Savings.
2. **No financial-stress signal**: e.g. missed or partial payments, high utilisation, a falling balance.
3. **Member gains money**: a net benefit greater than zero, **shown in rupees**.

If any check fails, show **no offer**. If the member is stressed, show **repayment help** in place of credit. Every decision, including blocked offers and the reason, is recorded and shown in admin.

## Core real-life flow (the golden path)

1. Member buys a **₹1.5L laptop on ShopKart** by card → gateway → Mock Bank OTP → approved.
2. Mock Bank posts the transaction to cred-api by **webhook** (simulating card statement/bill data).
3. cred-api stores it and emits an event; the engine runs: permission? → stress? → net benefit?
4. The offer appears **live** in the CRED app (first time: one-tap "Smart Savings" permission).
5. Accept → **key-fact screen** → lender (ecosystem-api) approves → **EMI schedule** appears in CRED.
6. Admin shows the transaction, the engine decision (including blocked offers and the reason) and the permission log, live.

UPI payments made from the CRED app go through the mock UPI switch and are seen by CRED directly.

## Features (priority order) and their real-world triggers

| # | Feature | What it does | Real-world trigger |
|---|---------|--------------|--------------------|
| 1 | **Big-Spend Support** | Unusually large purchase → cheaper EMI or pre-approved loan vs keeping it on the card | Large card purchase on ShopKart |
| 2 | **Wealth-Backed Liquidity** | Show sell vs borrow (tax, lost returns, interest) | Member starts selling funds/FDs/gold in CRED |
| 3 | **Earned Credit Ladder** | Visible credit tiers unlocked by on-time payments; shown as available, never pushed | On-time bill payments; control room advances months |
| 4 | **Family Health Insurance + Wellness Rewards** | Family floaters; summary activity score (Apple Health / Google Health Connect, mocked) earns small premium rewards | Member adds family members; wearable sends step summaries |
| 5 | **Salary-Verified Credit** | Verified income → better limits and rates | Account Aggregator consent → bank salary data |
| 6 | **Protection-Gap Engine + Claims Concierge** | Reads existing cover incl. employer cover, recommends cheapest way to close the gap; claim tracking | Insurer renewal event / employer cover |
| 7 | **Wealth Management** | Portfolio tracking, goal-based plans, fees disclosed | Portfolio linked via Account Aggregator |
| 8 | **Card-Balance Switch** | Cheaper EMI, rate steps down for on-time payments | Member pays only part of a card bill in CRED |

## Pillars

- **Borrow better**: 1, 2, 3, 5, 8
- **Protect**: 4, 6
- **Grow**: 7

## Business rules (enforce in code, not just UI)

- **Net benefit or no offer.** If the rupee saving is not positive after all fees and taxes, show nothing.
- **One active offer at a time**, with a **monthly cap** on proactive offers.
- **Never offer credit above affordability.**
- **Stressed members get help, not credit.**
- **Recommend the right cover, not the most.**
- **No dark patterns**: no pre-ticked boxes, countdown timers or false urgency.
- **Bill payment stays one tap** and is never blocked or delayed by an offer.

## Permissions (low friction)

- Requests the member starts themselves need **no extra permission screen**.
- One **"Smart Savings"** permission covers proactive offers. Ask for it **once**, at the first moment it delivers value.
- Ask for **income** and **health** data only when the member picks that feature.
- A **permissions dashboard** with one-tap withdraw for each permission.

## Privacy (in the CRED app; every action logged in admin)

- Permissions dashboard with one-tap withdraw
- "What CRED knows about me"
- Download my data
- Delete my data

## Control room (admin "Demo" tab)

- Service status: every app and API shown green or red
- Switch persona; fire scenarios (big purchase, partial bill payment, fund sale, insurer renewal, wearable sync); advance time by a month
- Reset demo button (same as `pnpm seed`)

## Key numbers for demo maths

- Card interest: **3.5% per month**, plus **18% GST on the interest**.
- Partner EMI: **16–18% p.a.**
- Processing fee: **1%**.
- On **₹1 lakh over 12 months**, the member saves **₹17,300–18,500** by moving from card to EMI.

**Savings method** (implemented once in `packages/engine`; every screen uses it, never its own maths):

- **Card cost:** ₹1L paid down in 12 equal monthly payments at 3.5% per month on the reducing balance, plus 18% GST on that interest.
- **EMI cost:** 12 equal payments on the reducing balance at the annual rate (monthly rate = annual ÷ 12), plus a 1% processing fee with 18% GST on the fee.
- **Saving** = card total cost − (EMI interest + fee + GST on fee).

Expected values, asserted by unit tests to within ₹1: card cost **₹28,533**; saving **₹18,476 at 16%** and **₹17,337 at 18%**.

Keep the rates and fees in a single constants module (`packages/engine/src/constants.ts`) so every feature uses the same numbers.

## Design

- Premium, dark and minimal, with a CRED-like feel but **no CRED logos or trademarks**.
- All money in **₹ with Indian number formatting** (e.g. ₹1,00,000, ₹17,300; use `en-IN` locale).
- Every offer card shows the rupee saving prominently, plus a clear "No thanks" of equal weight.

## Working rules for M4–M7

- Tests and the boundary checker must pass before finishing. If a failure can't be fixed properly, **stop and report**: never skip, weaken or delete tests.
- When a milestone is done: commit, tag (`m4`, `m5`, …), push (with tags).
- Keep `REVIEW.md` at the repo root: one section per milestone with what was built, decisions made without asking (with reasons), deviations from plan, known gaps, and screenshots of every new or changed screen in `docs/screenshots/<milestone>/` (run `pnpm screenshots <milestone>` with `pnpm dev` up; it also sweeps every screen for all five personas and runs axe).
- Keep this file up to date, including each milestone brief.

## Design system (M4)

- Tokens live in `packages/ui/src/themes` (colour, type scale, spacing, radius, elevation, motion) and reach Tailwind through `packages/ui/src/tailwind.css` (`text-display`, `p-card`, `shadow-e2`, `animate-enter`, `transition-calm`, …). Build screens only from tokens and `@cred/ui` components.
- Accessibility bar: AA contrast (theme tests cover text, muted, accent and status colours on every surface), 44px minimum tap targets (Button ≥ 44px, ListRow ≥ 56px), a label on every input (`Field`, `Choice`), loading, empty and error states on every screen.
- Member app: 390px phone frame centred on desktop; signed-in screens use `Screen` (top bar, optional sticky footer, tab bar). Data comes through `useApi` (`apps/cred/lib/live.tsx`), which refetches when cred-api pushes an SSE event.
- Member-facing copy is supportive: never "stress", "risk" or "blocked" (tested in the engine and by the boundary checker).
- Money moves on simulated time: new records (bill payments, UPI, reward entries) use the sim clock, as the seed does.
- Partner 4xx errors pass through cred-api with their own code and message; partner 5xx → 502.

## M4 brief (as given)

CRED app shell, fully polished, with the highest design bar in the project: premium, dark, minimal, mobile-first (390px phone frame, centred on desktop). Extend the cred theme with typography, spacing, radius, elevation and motion tokens first, then build all screens from them. Restrained motion, Indian number formatting, no CRED logos or trademarks.
Screens: Home (greeting, upcoming bills, cards summary, active offer with "Why am I seeing this?", any help card, rewards balance; bill pay one tap from home) · Cards (due amount, due date, utilisation; detail with recent transactions and Convert to EMI) · Bill pay (full or custom, UPI or bank, confirmation; partial payments recorded correctly) · UPI pay (UPI ID or contact, amount, mock UPI PIN screen in the ecosystem app, success) · Rewards (balance, earn history, redeemable rewards) · Money moments restyled · Loans (active loans, schedule, next due) · Profile (details, Permissions, "Your data and decisions").
Every screen: loading, empty and error states; AA contrast; 44px tap targets; labels on all inputs; data only via cred-api (contracts first); works for all five personas. Also folded in: the decision feed moved to Profile → "Your data and decisions", and supportive member wording for blocked offers.

## Conventions added in M5

- **Simulated clock:** `POST /sim/v1/clock/advance` plays out each month in date order at the institutions (salary, card spend, each persona's scripted bill habit, statement close with 3.5% + GST on anything carried, EMI collection and rate step-downs, weekly activity summaries, renewal notices, claim progress, fund NAVs, AA "new data" notices), all as signed webhooks, then `sim.clock.advanced`. On that, cred-api applies due dates: each bill becomes `paid_in_full`, `part_paid` or `missed`, which moves the ladder.
- **Credit ladder:** in full and on time → streak +1, tier rises when the streak reaches it; part paid (≥ minimum, on time) → streak 0, tier kept; missed → streak 0, down one tier. A tier change is recorded as a decision with outcome `available` (shown, never pushed; never an offer).
- **Credit line** = ladder tier limit and rate, raised by verified salary (limit up to 3× monthly salary, capped ₹5L; rate −1%). It is the limit used by affordability. Hidden while the member shows stress signals.
- **Scripted bill habits** pay only if the member made no payment that cycle themselves; short of cash they pay what the account allows (never below the minimum, keeping ₹5,000).
- **Decision outcomes:** `offer | blocked | help | available`. New reason codes `already_covered` (nothing to add) and `needs_data` (policies not linked).
- **Every feature goes through the engine** (`packages/engine/src/features/*`): pure, two-phase where partner prices are needed (lender or insurer quotes), every check saved. Insurance offers carry `InsuranceTerms`; the "keep things as they are: ₹0" option always comes first, as "pay in full" does for credit.
- **Insurance net benefit** is measured against the other way of arranging the same cover (add to floater vs separate floater; top-up vs second base policy; standalone own-damage vs comprehensive). Prices always come from the insurer.
- **Account Aggregator:** one consent per purpose (`income_verification` → DEPOSIT, 6 months, read once; `portfolio_tracking` → MUTUAL_FUNDS + TERM_DEPOSIT, 12 months; `protection_review` → INSURANCE_POLICIES). Approving at SimAA grants the matching permission (`income_data`, `portfolio_data`, `insurance_data`). Withdrawing the permission revokes the consent and deletes what CRED derived. Raw bank transactions are never stored.
- **Wellness:** CRED stores weekly summaries only (avg steps, active days, score). Reward = share of the floater's 10% max by average score (≥80 full, ≥60 half, ≥40 quarter).
- **Alerts** (`MemberAlert`) are information only (market fall, collateral, renewal, claim, ladder, loan, policy), idempotent by source event, never offers.
- **Member decision feed** hides everyday purchases that were never candidates (Big-Spend `no_signal`); admin shows everything.
- **Lender quotes** carry one anonymous attribute: `incomeVerified` (priced 1% lower). Loans against holdings go to Keystone Capital (secured); the lender checks its own loan-to-value limits (CRED's rules are stricter) and marks a lien.
- **HTTP:** services close each connection after responding (service-kit `onSend` hook). On Node 26, a keep-alive socket that answered while the process had outgoing fetches in flight parks the next request until the 30 s connection sweep.

## Conventions added in M6

- **Car cover check:** never assume what a dealer sold. With policies linked via AA, CRED reads the car's actual policy; otherwise it asks the member (alert → "Check your car's cover" form, `POST /v1/insurance/vehicles`). A suggestion is made only for a real gap (third-party only); comprehensive → nothing. The `new_vehicle` scenario takes `dealerCover` (`comprehensive` default, or `third_party`).
- **`insurance_data`** is granted only when the member approves a policy link on SimAA (from Protect → Link your policies, or a member-initiated cover check). Proactive checks without linked policies say so without nudging to link; there is never a permission prompt for it.
- **Wellness at renewal:** with `health_data` on, CRED shares one number (the 4-week average activity score) with the insurer of a floater bought through CRED. The insurer's `renewal_due` carries base premium, discount and premium due; on the date it collects the discounted premium and sends `insurer.policy.renewed`; CRED shows the saving.
- **Early repayment:** lender quotes (`prepayment-quotes`) charges (nil on all current loans, as their key facts say) and interest saved; part payments keep the EMI and shorten the loan; `lender.loan.prepaid` confirms. EMIs the account can't cover bounce (`lender.emi.bounced`), stay overdue and are retried; 90+ days past due counts as a default in admin.
- **Rule settings are live:** `RULE_DEFINITIONS` carry `min`/`max`; `validateRuleChange` also enforces cross-rule consistency. Overrides live in `RuleSetting` (cred.db), cached in cred-api (`activeRules()`), reloaded on change and reset. Every change needs a reason and is audited (`rule.changed`, `rule.reset_all`).
- **Privacy:** delete stops flows at source (AA revoke, health app unlink), deletes CRED's data, anonymises the member and keeps only loans and CRED-bought policies (held with partners), their offers/decisions, the audit log and complaints; the screen lists what is kept and why.
- **Admin funnel:** an offer is *shown* when `shownAt` is set (on creation if shown, or when Smart Savings is granted); dismissed = declined; blocked grouped by first reason. Member gains = accepted offers' measured saving + interest saved by early repayment + wellness discounts.
- **Control room:** world events go to ecosystem-api `/sim/v1/scenarios`; member actions go to cred-api `/sim/member-actions`, which acts through cred-api's own public API with that member's session (so every rule applies). AA approvals for those actions use `/sim/v1/aa/approve`. All refuse without `DEMO_MODE=true`.
- **Partner log:** every `ctx.partner` call is recorded (`PartnerCall`), shown in admin with the inbound webhook log.

## Conventions added in M7

- **Repayment plan:** offered only from the help card (member-initiated, never a proactive offer). `GET /v1/repayment-plan` returns 3, 6 and 12-month options from `repaymentPlanOptions` (engine, plan rate `planRatePaBps` 12% p.a., no fee, reducing balance) against carrying the balance on the card; balances under `planMinBalancePaise` (₹5,000) aren't offered one. Start (unticked acknowledgement) → partner (Northstar, `LoanKind` `repayment_plan`) → e-sign OTP → disbursal clears the card's carried balance → tracked in Loans. While a plan is open the snapshot has `onRepaymentPlan`; the stress check stops every feature with `on_repayment_plan`, and the credit line is hidden.
- **EMI bounce:** the `cash_crunch` scenario (control room → Guardrails) drains the persona's bank account to ₹1,000 and holds next month's salary 10 days (`salaryDelayDays`, negative while held). The next collection bounces (`lender.emi.bounced`) → a calm member alert and an Overdue banner on the loan with **Pay now** (`/v1/loans/:loanId/pay-overdue`, refused kindly if the account is still short) and **Talk to us**. Admin Overview: "EMIs bounced in the last month", funnel "Now overdue", "Members on a repayment plan". Late collections are marked `paid`.
- **Console login:** staff accounts in `StaffUser` (scrypt hash). Seeded `ops@cred.example` / `trust-first-demo` (Ananya Rao, `DEMO_STAFF` in `packages/db/src/seed/staff.ts`, printed in README). `POST /admin/v1/login` issues an `stf.`-prefixed token signed over `staff.<payload>`; member tokens never pass `auth: 'admin'`. The console keeps it in localStorage and sends it as Bearer (SSE: `?token=`). Logins and failures are audited; rule and complaint audits name the staff member.
- **`pnpm demo`** (`scripts/demo.mjs`) is the documented way to start a demo: clears the apps' `.next`, runs `pnpm seed`, starts `pnpm dev` with `LOG_LEVEL=warn` and `DEMO_MODE=true` (output to `logs/demo.log`, git-ignored), waits for all six `/status` endpoints, warms the pages and prints URLs and the console login.
- **ShopKart** is a real store: 12-product catalogue (`apps/shop/lib/catalog.ts`; slugs `aero-14`, `studio-27`, `usb-c-cable` are used by tests), product pages, a cookie cart, checkout with card (gateway → Mock Bank OTP) or UPI (gateway collect → SimUPI PIN page; refused above ₹1 lakh), order confirmation. Nothing is pre-selected at checkout. Gateway UPI payments are not reported to CRED (CRED sees only UPI made from its own app).
- **Ecosystem portals:** every partner has a customer-facing page in its own brand (`?c=per_<persona>` picks the customer): `/bank`, `/upi`, `/aa`, `/insurer`, `/fundhouse`, `/lender`, `/health`, plus a directory at `/`. They read only ecosystem-api (`auth: 'page'` endpoints). New themes `lender` and `health`.
- **Loan against holdings:** CRED sizes the pledge at its own loan-to-value and rounds pledged units **up** (3 decimals), so the pledge never falls a fraction short of the lender's cap.

## M7 brief (as given)

Start M7. Same rules: tests and boundary checker green or STOP and report; commit, tag "m7", push; add an M7 section to REVIEW.md; keep CLAUDE.md updated.
First, M6 follow-ups:
1. Repayment plan: Rohan's help card promises one, so build it. The member chooses a plan to clear the carried balance over 3, 6 or 12 months; CRED shows the monthly amount and total interest versus carrying it on the card; the plan is created through a partner and tracked in Loans. No new credit is offered while on a plan. Wording stays supportive.
2. EMI bounce: add a control room scenario that makes a persona short at month end, so an EMI bounces. Show the member a calm notice with options (pay now, contact support), and make admin's defaults metric and funnel reflect it. Add an e2e test.
3. Admin login: a simple demo login for the admin console (seeded staff account, credentials shown in the README), separate from the member app.
4. Demo reliability: add `pnpm demo`, which clears Next caches, resets seed data, sets LOG_LEVEL=warn and starts everything, then waits until every service reports green. Make it the documented way to start a demo.
Then polish and demo readiness:
- ShopKart: looks like a real store (catalogue, product pages, cart, checkout with card and UPI, order confirmation).
- Ecosystem screens: Mock Bank, UPI, Account Aggregator, insurer, fund house, lender and the health-app pages each get credible, distinct branding (including the portal pages deferred from M5).
- Seed data tuned so every feature has a persona that triggers it cleanly.
- README: setup, URLs, admin login, and a DEMO SCRIPT of 5–6 journeys that together show all 8 features, the guardrails (Rohan's repayment plan) and the privacy flow, with exact clicks.
- Full final screenshot set in docs/screenshots/final/.
Then give me a short summary pointing to REVIEW.md, a single list of every decision you made on your own across M4–M7, and what I should check first. Stop.

## M6 brief (as given)

Start M6. Same rules: tests and boundary checker green or STOP and report; commit, tag "m6", push; add an M6 section to REVIEW.md with decisions, deviations, gaps and screenshots in docs/screenshots/m6/; keep CLAUDE.md updated.

First, M5 follow-ups:
1. New-vehicle cover: don't assume the dealer sold only third-party. Frame it as a cover check on the new car: read what was actually bought (via the insurer link or member input) and recommend only if there is a real gap. Update REVIEW.md.
2. Confirm the insurance_data permission is asked only when the member starts a cover check or links a policy, never as a cold prompt. Fix if not.
3. Apply the wellness reward at renewal: the insurer's renewal webhook carries the discounted premium, and CRED shows the saving earned.
4. Loan prepayment: members can repay part or all of any loan early from the Loans screen, with the charges (if any) and interest saved shown before confirming; the lender confirms by webhook.

Then:

CRED privacy area: permissions dashboard (one-tap withdraw per permission, including insurance_data and Account Aggregator links), "What CRED knows about me", "Your data and decisions", download my data (JSON), delete my data (with confirmation; loans and policies held by partners are retained as required, and the screen says so). Every action logged.

Admin console: overview; offer funnel by feature (shown, accepted, dismissed, blocked by reason); member gains; defaults; complaints; members and transactions; permission and audit log; partner and webhook log; rule settings editable live (validated, every change logged).

Control room (/demo): service status, persona switcher, scenario buttons for every feature trigger, advance time by a month, reset demo.

Admin and control room look clean and credible, consistent with the admin theme. Stop after M6.

## M5 brief (as given)

Start M5. Same rules: tests and boundary checker green or STOP and report; commit, tag "m5", push; add an M5 section to REVIEW.md with decisions, deviations, gaps and screenshots in docs/screenshots/m5/; keep CLAUDE.md updated.

First, close the M4 gap: statements must close on the simulated clock, and on-time payments must update credit ladder streaks. "Advance a month" (a /sim endpoint, wired to the control room in M6) closes statements, applies due dates, updates streaks and moves members up tiers.

Then build features 2–8, each from its real-world trigger, all through the shared engine and every business rule:
2. Wealth-Backed Liquidity: member starts selling funds/FDs/gold in CRED → sell vs borrow (tax, lost returns, interest) → loan against portfolio via lender; loan capped at a conservative share of value; market-fall alert as a /sim scenario.
3. Earned Credit Ladder: tiers from on-time bill payments; next tier and payments needed shown; limits shown as available, never pushed.
4. Family Health Insurance + Wellness Rewards: add parents/children; floater comparison from the insurer with waiting periods stated clearly; mock Apple Health / Google Health Connect sends only a summary activity score; premium reward shown.
5. Salary-Verified Credit: member chooses to verify → Account Aggregator consent screen in the ecosystem app → bank salary data → better limit and rate; never triggers new offers by itself.
6. Protection-Gap Engine + Claims Concierge: reads existing cover including employer cover; insurer renewal or new vehicle triggers a gap check; recommends the cheapest way to close it, nothing if covered; claim filing and tracking with status updates from the insurer by webhook.
7. Wealth Management: link portfolio via Account Aggregator (gold self-declared); tracking, goals, fees disclosed; advice kept separate from product sales.
8. Card-Balance Switch: partial bill payment → interest saved by moving the balance to an EMI; rate steps down for on-time payments.

Match the M4 design system and supportive wording rules. For each feature: unit tests plus e2e tests covering its trigger, happy path and at least one blocked case. Stop after M5.

## Milestones

Commit after each. The golden path must work from M2 onward.

- **M1** Monorepo scaffold, `packages/types` with all schemas, db schemas, seed personas, brand themes, all apps running with placeholder pages, status endpoint on every service.
- **M2** Golden path end to end, unstyled, with the e2e test passing.
- **M3** Engine hardened with unit tests: permissions, stress check, net benefit, offer caps, all business rules.
- **M4** CRED app shell: home, cards, bill pay, UPI pay, rewards, fully polished.
- **M5** Remaining 7 features, each wired to its real trigger.
- **M6** Privacy screens, admin console, control room.
- **M7** ShopKart and ecosystem polish, demo script in README, seed data tuned for the demo.
