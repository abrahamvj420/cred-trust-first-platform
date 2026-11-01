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
pnpm seed              # creates cred.db and ecosystem.db and loads the demo personas
pnpm dev               # starts all four apps and both APIs
```

`pnpm seed` prints a one-line summary per persona when it finishes. Run it again at any time to reset all data to the demo starting point.

### URLs

| What | URL | Port |
|---|---|---|
| CRED member app | http://localhost:3000 | 3000 |
| CRED console (admin) | http://localhost:3001 | 3001 |
| Demo control room | http://localhost:3001/demo | 3001 |
| ShopKart store | http://localhost:3002 | 3002 |
| Ecosystem (bank, UPI, AA, insurer, fund house) | http://localhost:3003 | 3003 |
| cred-api | http://localhost:4000/status | 4000 |
| ecosystem-api | http://localhost:4100/status | 4100 |

Every app and service answers `GET /status`. Once the control room shows all six green, the setup works.

### Other commands

```bash
pnpm test              # unit tests + boundary checks
pnpm test:e2e          # golden-path tests; starts its own APIs on 4900/4910 with throwaway data
pnpm typecheck
pnpm screenshots m5    # with pnpm dev up: sweeps every screen for all personas, runs axe, saves screenshots
```

### Simulating the world (DEMO_MODE only)

The control room at http://localhost:3001/demo does all of this with buttons: service status, persona switch (the CRED app follows), a trigger for every feature, advance a month, reset. The same endpoints by hand:

```bash
# Advance the clock a month: salaries, card spend, each persona's bill habit, statements,
# EMIs, activity summaries, renewals, claims and fund prices, then due dates and the credit ladder
curl -X POST localhost:4100/sim/v1/clock/advance -H 'content-type: application/json' -d '{"months":1}'

# Fire a real-world event for a persona: big_purchase, insurer_renewal, wearable_sync,
# market_fall, new_vehicle, claim_update
curl -X POST localhost:4100/sim/v1/scenarios -H 'content-type: application/json' -d '{"scenario":"new_vehicle","personaKey":"priya","dealerCover":"third_party"}'

# Do something in the app as a member: partial_bill_payment, fund_sale, verify_salary,
# link_portfolio, link_policies, add_parents, connect_wearable
curl -X POST localhost:4000/sim/member-actions -H 'content-type: application/json' -d '{"action":"partial_bill_payment","personaKey":"kabir"}'
```

### Troubleshooting

- **Port already in use:** stop whatever is using ports 3000–3003, 4000 or 4100. The ports are fixed by design.
- **`Cannot find module './generated/...'`:** run `pnpm db:generate`. The Prisma clients are generated and not committed.
- **Fonts fail to load on first run:** the apps load Google Fonts via `next/font`, which needs internet access the first time.

### Demo personas

| Persona | Story | Features |
|---|---|---|
| Aarav Mehta | Pays in full, about to buy a ₹1.5L laptop, no Smart Savings yet | Golden path, 1, 2, 3, 5, 7 |
| Priya Nair | Family of five, employer cover plus a floater, parents uncovered, renewal due | 4, 6 |
| Sneha Kapoor | ₹25L across FDs, funds and gold; saving for a house | 2, 7 |
| Kabir Singh | Newer member; this month's bill includes a flight he can't clear at once | 3, 5, 8 |
| Rohan Das | Minimum-only payments; the laptop would take him to ~96% of his limit: gets help, not credit | Stress case |

## Demo flow

_Written in M7._
