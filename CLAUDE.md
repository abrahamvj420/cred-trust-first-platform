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
              page, insurer and fund house pages
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
            upi, aa, insurer, fundhouse)
```

## Non-negotiable rules

- **Contracts first.** No endpoint or webhook exists without its schema in `packages/types`. Validate every request and webhook with Zod on both sides.
- **Front-ends call only their own API**, never a database or the engine directly.
- **CRED never reads the ecosystem database.** Data reaches CRED only through webhooks or consented pulls (Account Aggregator), as in real life.
- **Each app uses only its own brand theme** from `packages/ui`. No ad-hoc colours or fonts.
- **Polish priority:** the CRED app and the core flow get full polish; ShopKart looks like a real store; admin and ecosystem screens look credible and clean.
- `pnpm dev` starts everything, each on a fixed port (listed in README). `pnpm seed` resets all data to the demo personas.
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

## Milestones

Commit after each. The golden path must work from M2 onward.

- **M1** Monorepo scaffold, `packages/types` with all schemas, db schemas, seed personas, brand themes, all apps running with placeholder pages, status endpoint on every service.
- **M2** Golden path end to end, unstyled, with the e2e test passing.
- **M3** Engine hardened with unit tests: permissions, stress check, net benefit, offer caps, all business rules.
- **M4** CRED app shell: home, cards, bill pay, UPI pay, rewards, fully polished.
- **M5** Remaining 7 features, each wired to its real trigger.
- **M6** Privacy screens, admin console, control room.
- **M7** ShopKart and ecosystem polish, demo script in README, seed data tuned for the demo.
