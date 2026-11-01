# CRED Trust-First Cross-Sell Platform (Prototype)

This is a prototype of a shared offer engine that lets CRED offer lending, insurance and wealth products only at real money moments, only with the member's permission, and only when the member gains in rupees. Each offer must pass three checks: the member has given permission, there is no sign of financial stress, and the member saves or earns money, with the amount shown in ₹. If any check fails, the member sees no offer, or gets help with repayment if they show signs of stress.

> Class prototype for Business in the Digital Age (SPJIMR). All data is synthetic. It uses no real APIs, payments or personal data, and is not affiliated with or endorsed by CRED.

## Features

### Borrow better
1. **Big-Spend Support**: after an unusually large purchase, offers a cheaper EMI or pre-approved loan in place of keeping the amount on the card.
2. **Wealth-Backed Liquidity**: when a member starts selling funds, FDs or gold, compares selling with borrowing against them (tax, lost returns, interest).
3. **Earned Credit Ladder**: visible credit tiers unlocked by paying on time. Tiers are shown as available and never pushed.
5. **Salary-Verified Credit**: the member verifies income (mocked account aggregator) to get better limits and rates.
8. **Card-Balance Switch**: when a card bill is paid only in part, offers a cheaper EMI whose rate steps down with on-time payments.

### Protect
4. **Family Health Insurance with Wellness Rewards**: family floater plans. A summary activity score (mocked Apple Health / Google Health Connect) earns small premium rewards.
6. **Protection-Gap Engine with Claims Concierge**: reads existing cover, including employer cover, recommends the cheapest way to close the gap, and tracks claims.

### Grow
7. **Wealth Management**: portfolio tracking and goal-based plans, with fees disclosed.

## Tech stack

pnpm + Turborepo monorepo, TypeScript everywhere.

- **Apps:** Next.js 16 (App Router) + Tailwind CSS 4
- **Services:** Fastify 5, contracts in Zod 4 (`packages/types`)
- **Data:** Prisma 7 + SQLite, one database per service (`cred.db`, `ecosystem.db`)
- **Tests:** Vitest (unit), plus `pnpm test:e2e` across running services

| Path | What it is | Port |
|---|---|---|
| `apps/cred` | CRED member app | 3000 |
| `apps/admin` | CRED internal console + Demo control room | 3001 |
| `apps/shop` | ShopKart demo store | 3002 |
| `apps/ecosystem` | Outside-world screens: `/bank`, `/upi`, `/aa`, `/insurer`, `/fundhouse` | 3003 |
| `services/cred-api` | CRED backend: ingest, offer engine, permissions, audit, SSE | 4000 |
| `services/ecosystem-api` | Bank, gateway, UPI, AA, lender, insurer, fund house, wearable, `/sim` | 4100 |

Shared packages: `types` (contracts), `engine` (offer engine + savings maths), `db` (Prisma schemas + seed personas), `ui` (components + one theme per brand), `service-kit` (contract-only Fastify routing, validation, `/status`, DEMO_MODE guard).

## Setup (fresh clone)

### Prerequisites

- **Node.js 22.12 or later** (developed on Node 26). Check with `node -v`.
- **pnpm 10** (the repo pins `pnpm@10.34.9` in `package.json`). Install with `npm install -g pnpm@10`, or run `corepack enable` if your Node version still ships corepack.
- macOS, Linux or WSL. SQLite comes with the `better-sqlite3` package, so there is nothing else to install.

### Steps

```bash
git clone https://github.com/abrahamvj420/cred-trust-first-platform.git
cd cred-trust-first-platform

cp .env.example .env   # local demo secrets (placeholders), DEMO_MODE=true
pnpm install           # installs everything and generates both Prisma clients
pnpm demo              # the way to start a demo (below)
```

**`pnpm demo` is the documented way to start a demo.** It clears the Next.js caches, resets the seed data to the demo personas, starts all four apps and both APIs with `LOG_LEVEL=warn` and `DEMO_MODE=true` (output goes to `logs/demo.log`), then waits until every service reports green and prints the URLs. Wait for `✔ Demo ready` (about a minute on a first run). Press Ctrl+C to stop.

For development, `pnpm seed` resets the data and `pnpm dev` starts everything with normal logging.

### URLs

| What | URL | Port |
|---|---|---|
| CRED member app | http://localhost:3000 | 3000 |
| CRED console (admin) | http://localhost:3001 | 3001 |
| Demo control room | http://localhost:3001/demo | 3001 |
| ShopKart store | http://localhost:3002 | 3002 |
| Ecosystem directory (all partner sites) | http://localhost:3003 | 3003 |
| Mock Bank · SimUPI · SimAA · insurer · fund house · lender · health app | http://localhost:3003/bank (also `/upi`, `/aa`, `/insurer`, `/fundhouse`, `/lender`, `/health`); add `?c=per_sneha` (or any persona) to open as that customer | 3003 |
| cred-api | http://localhost:4000/status | 4000 |
| ecosystem-api | http://localhost:4100/status | 4100 |

Every app and service answers `GET /status`. Once the control room shows all six green, the setup works.

### Logins

| Where | How |
|---|---|
| CRED member app | Tap a persona on the sign-in screen (no password; synthetic members). The control room's **Show on phone** switches it too. |
| CRED console (admin) | **`ops@cred.example`** / **`trust-first-demo`** (seeded staff account, Ananya Rao). Separate from the member app. |
| Bank OTP, lender e-sign, insurer OTP | Any 6 digits work; the demo code is shown on screen. |
| UPI PIN | **1234** |

### Other commands

```bash
pnpm test              # unit tests + boundary checks
pnpm test:e2e          # golden-path tests; starts its own APIs on 4900/4910 with throwaway data
pnpm typecheck
pnpm screenshots final # with the demo up: sweeps every screen for all personas, runs axe, saves screenshots
```

### Simulating the world (DEMO_MODE only)

The control room at http://localhost:3001/demo does all of this with buttons: service status, persona switch (the CRED app follows), a trigger for every feature, advance a month, reset. The same endpoints by hand:

```bash
# Advance the clock a month: salaries, card spend, each persona's bill habit, statements,
# EMIs, activity summaries, renewals, claims and fund prices, then due dates and the credit ladder
curl -X POST localhost:4100/sim/v1/clock/advance -H 'content-type: application/json' -d '{"months":1}'

# Fire a real-world event for a persona: big_purchase, insurer_renewal, wearable_sync,
# market_fall, new_vehicle, claim_update, cash_crunch (short at month end: the next EMI bounces)
curl -X POST localhost:4100/sim/v1/scenarios -H 'content-type: application/json' -d '{"scenario":"new_vehicle","personaKey":"priya","dealerCover":"third_party"}'

# Do something in the app as a member: partial_bill_payment, fund_sale, verify_salary,
# link_portfolio, link_policies, add_parents, connect_wearable
curl -X POST localhost:4000/sim/member-actions -H 'content-type: application/json' -d '{"action":"partial_bill_payment","personaKey":"kabir"}'
```

### Troubleshooting

- **Port already in use:** stop whatever is using ports 3000–3003, 4000 or 4100. The ports are fixed by design.
- **`Cannot find module './generated/...'`:** run `pnpm db:generate`. The Prisma clients are generated and not committed.
- **A page keeps reloading ("Fast Refresh") or looks stale:** stop and run `pnpm demo` again; it clears the Next.js caches.
- **Something looks stuck after a lot of clicking:** press **Reset demo** in the control room (same as `pnpm seed`).
- **Fonts fail to load on first run:** the apps load Google Fonts via `next/font`, which needs internet access the first time.

### Demo personas

| Persona | Story | Features |
|---|---|---|
| Aarav Mehta | Pays in full, about to buy a ₹1.5L laptop, no Smart Savings yet | Golden path, 1, 2, 3, 5, 7 |
| Priya Nair | Family of five, employer cover plus a floater, parents uncovered, renewal due | 4, 6 |
| Sneha Kapoor | ₹25L across FDs, funds and gold; saving for a house | 2, 7 |
| Kabir Singh | Newer member; this month's bill includes a flight he can't clear at once | 3, 5, 8 |
| Rohan Das | Minimum-only payments; the laptop would take him to ~96% of his limit: gets help, not credit, and can set up a repayment plan | Guardrails |

## Demo script

Six journeys, about 25 minutes in all, that together show all 8 features, the guardrails and the privacy flow. Before you start:

1. Run `pnpm demo` and wait for `✔ Demo ready`.
2. Open four browser windows side by side:
   - the **CRED app** (http://localhost:3000, best in a narrow window or phone view);
   - the **console** (http://localhost:3001; sign in as `ops@cred.example` / `trust-first-demo`);
   - the **control room** (console → **Control room**);
   - **ShopKart** (http://localhost:3002).
3. In the control room, pick the journey's persona and press **Show on phone**: the CRED app switches to that member. Start each journey with **Reset demo** unless it says to continue.

Codes: any 6 digits pass an OTP (the demo code is on screen); the UPI PIN is **1234**. Money moves on simulated time, starting **2 Nov 2026**.

### Journey 1 · Aarav buys a laptop (golden path · feature 1)

1. **ShopKart:** in the header, choose **Aarav Mehta** and click **Switch**. Open **Aero 14 Laptop** (₹1,50,000) → **Buy now** (or **Add to cart** → cart → checkout).
2. Checkout: choose **Credit or debit card**, pick Aarav's card → **Pay ₹1,50,000**. You land on **Mock Bank**'s OTP page: type any 6 digits → **Confirm payment** → order placed.
3. **CRED app** (no refresh needed; it updates live): Home shows a one-time **Smart Savings** card with the offer's conditional headline ("If you can't clear ₹1,50,000 by the due date, an EMI saves you ₹…"). Tap **Turn on**.
4. The offer card shows the rupee saving and an equal-weight **No thanks**. Tap **Why am I seeing this?** for the plain-English reason.
5. Open the offer: every option side by side, **Pay the full bill: ₹0** first. Choose the EMI → **key-fact screen** (rate, fee, total cost; the acknowledgement box is unticked) → tick it → **Accept**.
6. The lender sends an e-sign OTP (shown on screen): type it → **Confirm and sign**. The **EMI schedule** opens; it is also under **Loans**.
7. **Console:** **Transactions** shows the purchase; **Decisions** shows the engine run with every check (signal → permission → stress → offer cap → affordability → likely to carry → net benefit) next to its explanation; **Permissions & audit** shows Smart Savings being granted; **Partners & webhooks** shows the bank webhook and lender calls.

### Journey 2 · Aarav verifies his salary, links his investments, then has a bad month (features 5, 7 · EMI bounce)

Continue from journey 1 (don't reset).

1. **CRED → Credit:** the Earned Credit Ladder shows his tier and what unlocks next (shown as available, never pushed). Start salary verification → **Continue to Account Aggregator**. The **SimAA** consent page (its own brand) lists exactly what is shared and for how long → **Approve**. Back in CRED, the verified salary shows better limits and rates (feature 5).
2. **CRED → Wealth → Link investments** → **Continue to Account Aggregator** → **Approve** on SimAA. Wealth now tracks his funds and deposits, with **Fees this year** shown (feature 7). Tap **Add a goal**, fill it in, tap **Plan this goal**: the plan shows the monthly amount, the expected return and the fees.
3. **Control room** (persona Aarav) → **Guardrails · EMI bounce** → **Short at month end** (an emergency bill empties his account and his salary is 10 days late) → **Advance a month**.
4. **CRED:** a calm notice, **An EMI didn't go through**, with no blame. Open the loan: tap **Pay now**. CRED kindly says the account doesn't have enough yet. **Talk to us** opens Help.
5. **Console → Overview:** **EMIs bounced in the last month** and the funnel's **Now overdue** count both show 1.

### Journey 3 · Sneha needs cash and starts selling (feature 2)

**Reset demo**, persona **Sneha**.

1. **CRED → Wealth** → **Meridian Flexi Cap** → **Sell some**. Enter **2,00,000** → **See what it costs**.
2. Sell vs borrow side by side: tax, lost returns and interest, in rupees. Tap **Borrow instead** → the loan against the fund (up to 50% of its value) → key facts (the lien is explained) → tick → **Accept** → OTP → **Confirm and sign**.
3. **Control room** → **Market falls 15%**. **CRED → Alerts** explains calmly what the fall means for the pledged units and whether anything needs doing.
4. Optional: http://localhost:3003/lender?c=per_sneha is the lender's own portal (Keystone Capital), and http://localhost:3003/fundhouse?c=per_sneha shows the units under lien.

### Journey 4 · Sneha's privacy (permissions, what CRED knows, download, delete)

Continue from journey 3.

1. **CRED → Profile → Permissions:** every permission with one-tap **Withdraw**. Withdraw **Smart Savings**: proactive offers stop at once.
2. **Profile → Your data and decisions:** **What CRED knows about me** (and what it never holds), and **Every suggestion we considered, and why** (offers made and not made, in plain English).
3. **Download my data** saves a JSON export.
4. **Delete my data** → read **What we'll delete** and **What must be kept** (her loan against the fund stays until it is repaid, and the reason is given) → type **DELETE** → confirm. **Your data is deleted.**
5. **Console → Permissions & audit:** the withdrawal, the export and the deletion are each logged.

### Journey 5 · Priya protects her family (features 4, 6, 3)

**Reset demo**, persona **Priya**.

1. **Control room → Add parents, compare cover** (or in CRED: **Protect → Family → Add someone**, twice). **CRED → Protect → Family:** tick **Gopal Menon** and **Lakshmi Menon**, choose **₹5 lakh** → **Compare from the insurer**. The insurer's two ways to cover them (add to her floater, or a separate parents' plan) appear side by side in rupees, the cheaper one marked. Open one → key facts with waiting periods → tick → **Accept** → **Confirm and pay premium** (feature 4).
2. Priya already shares weekly activity summaries. **Control room → Health app syncs**, then **CRED → Protect → Wellness** shows the activity score (summaries only, never raw health data) and the premium reward it earns. The health app has its own page: http://localhost:3003/health?c=per_priya.
3. **Control room → Insurer renewal notice.** **CRED → Protect** shows **There's a gap** → **See the cheapest way to close it**: a top-up, not a bigger policy ("the right cover, not the most") (feature 6).
4. **Control room → New car, third-party only.** CRED notices the car has third-party cover only and suggests own-damage cover (also feature 6). With Aarav, whose policies aren't linked, CRED asks about the car's cover in place of assuming it.
5. **CRED → Protect → File a claim** → **Sahaj Family Floater** → amount → **File with the insurer**. **Control room → Insurer updates claim** (press it twice): the claim moves forward live in CRED.
6. **Reset demo**, persona **Priya**, then **Advance a month** twice. She pays both bills in full: **CRED → Credit** shows **Gold** as **Now available** (feature 3), and her floater's 25 Nov renewal applied her wellness saving (**Protect → Wellness**).

### Journey 6 · Kabir pays part of his bill; Rohan gets help, not credit (feature 8 · guardrails)

**Reset demo**, persona **Kabir**.

1. **CRED → Home → Pay card bill:** choose **Another amount**, enter **30,000**, keep **UPI** → pay → **Payment successful**, with **Left on this bill** shown. Bill pay stays one tap and is never blocked or slowed by an offer.
2. Home now shows **If you carry the remaining ₹…, an EMI saves you ₹…**. Open it → compare → key facts → tick → **Accept** → OTP → **Confirm and sign**. The loan shows **Your rate steps down when you pay on time**.
3. **Control room → Advance a month** twice: two on-time EMIs, and the rate on the loan steps down (feature 8).

**Reset demo**, persona **Rohan** (pays only the minimum, high utilisation).

4. **Control room → ₹1.5L laptop on the card.** CRED shows **no offer**, only a supportive help card ("Talk to us", "See a plan"). **Console → Decisions:** the engine stopped at the stress check, with the reason logged.
5. Tap **See a plan**. Choose **3, 6 or 12 months**: each shows the monthly amount and the total interest versus carrying it on the card. Pick **6 months**, tick the acknowledgement → **Set up this plan** → OTP → **Confirm my plan**. The plan is created by the partner lender and opens in **Loans**.
6. **CRED → Credit:** no credit line is shown while he is on the plan, only a link to it. Nothing new is suggested until the plan is done.

### What each journey covers

| Journey | Features | Guardrails and privacy |
|---|---|---|
| 1 Aarav, laptop | 1 Big-Spend Support | Permission asked once, at the moment of value; conditional saving; key facts before e-sign |
| 2 Aarav, salary and investments | 5 Salary-Verified Credit, 7 Wealth Management, 3 (ladder shown) | Consent per purpose on SimAA; EMI bounce handled calmly |
| 3 Sneha, selling | 2 Wealth-Backed Liquidity | Loan-to-value cap; market-fall alert |
| 4 Sneha, privacy | | Withdraw, what CRED knows, download, delete (loan retained, explained) |
| 5 Priya, family | 4 Family Health + Wellness, 6 Protection Gap + Claims, 3 Earned Credit Ladder | Right cover, not the most; asks rather than assumes |
| 6 Kabir and Rohan | 8 Card-Balance Switch | Stressed member gets help, not credit; repayment plan; no new credit while on it |
