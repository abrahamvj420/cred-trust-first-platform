# Review log

One section per milestone from M4 onward: what was built, decisions taken without asking (and why), deviations from the plan, known gaps, and screenshots.

---

## M7 · Follow-ups, ShopKart, partner portals and demo readiness

Tag `m7`. Gate at tag:
- `pnpm typecheck`: 11 packages.
- `pnpm test`: 191 unit tests (engine 124, ui 50, types 11, service-kit 6) and the boundary checker (9 rules).
- `pnpm test:e2e`: 67 cross-service tests, 8 of them new (7 in `m7.e2e.ts`, plus the loan-against-holdings rounding regression in `borrow.e2e.ts`).
- `pnpm screenshots final`: every member screen for all five personas, every flow from M4 to M7 and every console page; no serious or critical axe findings.

### M6 follow-ups

1. **Repayment plan.** Rohan's help card now offers **See a plan**, alongside **Talk to us**.
   - The plan screen gives 3, 6 and 12 months. Each option shows the monthly amount and the total interest, compared with carrying the balance on the card over the same months (the savings method).
   - The acknowledgement box starts unticked. Confirming sends the plan to a partner (Northstar Finance) and asks for an e-sign OTP.
   - On disbursal, the lender clears the carried card balance and the plan appears in **Loans**.
   - While a plan is open, every feature stops at the stress check with `on_repayment_plan`, and Credit hides the credit line in favour of a link to the plan. The member-facing text is supportive: "every payment brings you closer".
2. **EMI bounce.** The new world scenario `cash_crunch` is under the control room's **Guardrails · EMI bounce** group: **Short at month end**, then **Advance a month**.
   - It drains the persona's account to ₹1,000 with an emergency hospital bill and holds their salary 10 days. The next EMI bounces.
   - The member gets a calm alert ("An EMI didn't go through"), and the loan shows an Overdue banner with **Pay now** and **Talk to us**. Pay now is refused kindly while the account is still short.
   - When the late salary lands, the retried collection clears the EMI.
   - Admin Overview shows **EMIs bounced in the last month**, the funnel's **Now overdue** and **Members on a repayment plan**. Two e2e tests cover this.
3. **Console login.** A seeded staff account, `ops@cred.example` / `trust-first-demo` (Ananya Rao), with a scrypt hash.
   - The token has its own `stf.` prefix and signature, so member tokens never pass admin endpoints.
   - It is sent as Bearer, or as `?token=` for SSE. A 401 sends the console to `/login`, and there is a Sign out.
   - Logins and failed logins are audited, and rule and complaint audits name the staff member. Credentials are in the README.
4. **`pnpm demo`** clears the apps' `.next`, reseeds, and starts everything with `LOG_LEVEL=warn` and `DEMO_MODE=true`.
   - Output goes to `logs/demo.log`.
   - It waits for all six `/status` endpoints to report green, warms every page, then prints the URLs and the console login.
   - The README makes it the way to start a demo.

### Polish and demo readiness

- **ShopKart** is a real store: a 12-product catalogue in 4 categories with fictional brands, MRP and discount, ratings and specs.
  - Product pages, a cart (cookie), and checkout with card (gateway → Mock Bank OTP) or UPI (gateway collect → SimUPI PIN page). Nothing is pre-selected.
  - An order confirmation page.
- **Partner portals**, each in its own brand and reading only ecosystem-api, with `?c=per_<persona>` choosing the customer:
  - Mock Bank (fixed deposits, recent transactions, card statements);
  - SimUPI (payments);
  - SimAA (consents);
  - the insurer (policies);
  - the fund house (folios, with units under lien);
  - **new:** the lender (loans and schedules) and the health app (daily steps stay on the device; only the summaries are shared).
  - A directory at http://localhost:3003 links them all. `lender` and `health` themes were added, and contrast tests cover them.
- **Seed tuning.** I checked that every feature has a persona who triggers it cleanly from the control room; the final sweep and e2e run each one from a fresh reset. No persona data had to change. The staff account was added.
  - Aarav: 1, 5, 7, and the EMI bounce.
  - Sneha: 2 and privacy.
  - Priya: 3, 4, 6.
  - Kabir: 8.
  - Rohan: help, and the repayment plan.
- **README:** setup with `pnpm demo`, URLs including every portal, logins, troubleshooting, and a **demo script of six journeys** with exact clicks. A table maps the journeys to all 8 features, the guardrails and the privacy flow.
- **Final screenshot set** in `docs/screenshots/final/` (below).

### Decisions I made on my own

| Decision | Why |
|---|---|
| **Repayment plan at 12% p.a., no fee, 3/6/12 months, through Northstar; not offered under ₹5,000** (rule settings `planRatePaBps`, `planMinBalancePaise`) | A hardship plan should cost clearly less than a normal EMI (16–18%) and far less than the card. Charging a fee to someone struggling would undercut "help, not credit". Very small balances are better cleared from the bill. |
| **The plan is member-initiated only, from the help card**, and the lender pays the card directly | It is help, not a proactive offer. Paying the card directly means the carried balance really stops growing. |
| **While on a plan, every feature stops at the stress check** (`on_repayment_plan`), and the credit line is hidden | This is what "no new credit while on a plan" means in the engine itself, not just in the UI. It is logged like any other block. |
| **Cash crunch = emergency bill down to ₹1,000 plus salary 10 days late** | It is a believable, temporary shortfall. The bounce clears by itself when the salary lands, which shows retry and recovery without hand-editing data. |
| **No bounce charge** | No charge is in the key facts the member agreed to. Adding one would contradict them. |
| **Late collections are marked `paid`** (they used to stay `overdue`) | Found while building the bounce: an EMI collected late is paid. |
| **The console keeps its staff token in localStorage, not a cookie** | The console calls cred-api directly from the browser (no server of its own). It is a localhost demo; cookie sessions would need a backend for the console. |
| **`pnpm demo` writes service output to `logs/demo.log`** (git-ignored) | When the terminal stopped reading, turbo's stdout pipe stalled the dev services. A file never blocks. |
| **ShopKart UPI is refused above ₹1 lakh** at the gateway | This is the usual per-transaction UPI limit, so the ₹1.5L laptop must go by card, which is the golden path. |
| **UPI paid at ShopKart's gateway isn't reported to CRED** | Only UPI made from the CRED app is "seen by CRED directly". A merchant UPI payment would reach CRED only through a bank statement. |
| **Portals pick the customer with `?c=per_<persona>`**, with no partner login | These pages stand in for each partner's own site. A login per partner would add nothing to the demo. They read only ecosystem-api endpoints marked `auth: 'page'`. |
| **CRED rounds pledged fund units up** (3 decimals) | Found by the final sweep: a fund sale sized exactly at the 50% cap rounded the units down, so the lender refused the pledge as fractionally short. Now covered by an e2e test, which fails without the fix. |
| **The lender's "not enough in your account" message uses `formatInr`** | Spotted in the final screenshots: it said "13,610 rupees" in place of ₹13,610. |
| **The control room gained a "Guardrails · EMI bounce" group** (scenario + Advance a month) | The bounce needs a month to pass. Keeping the two steps visible makes the cause and effect clear in class. |

### Deviations from plan

- The EMI bounce takes two control-room presses, **Short at month end** then **Advance a month**, not one. That's because collections happen at month end.
- The ShopKart laptop can't be paid by UPI (the UPI limit); the UPI checkout is shown with a smaller item.

### Known gaps

- A single staff role. There are no password changes or lockout, and the staff token lasts until sign-out.
- There's no way to end a repayment plan early from the app. Early repayment works on loans; it hasn't been tried on plans.
- Partner portals are read-only views. Members act through CRED and the partner pages that flows open (OTP, PIN, consent).
- Bounced EMIs are retried only at the next month end. There's no "retry tomorrow".

### Screenshots (`docs/screenshots/final/`)

The full final set: every member screen for all five personas, every M4–M6 flow (regenerated), every console page, and the new screens below. No serious or critical axe findings.

| | | |
|---|---|---|
| `m7-01-help-card-plan` | `m7-02-plan-options` | `m7-03-plan-in-loans` |
| `m7-04-no-credit-on-plan` | `m7-05-bounce-alert` | `m7-06-bounce-options` |
| `m7-07-admin-defaults` | `m7-08-console-login` | `m7-10-shop-home` |
| `m7-11-shop-product` | `m7-12-shop-cart` | `m7-13-shop-checkout` |
| `m7-14-bank-otp` | `m7-15-shop-order` | `m7-16-shop-upi-pin` |
| `m7-20-ecosystem-directory` | `m7-21-bank-portal` | `m7-22-upi-portal` |
| `m7-23-aa-portal` | `m7-24-insurer-portal` | `m7-25-fundhouse-portal` |
| `m7-26-lender-portal` | `m7-27-health-app` | |

---

## M6 · Privacy, admin console and control room

Tag `m6`. Gate at tag:
- `pnpm typecheck`: 11 packages.
- `pnpm test`: 179 unit tests (engine 122, including rule-range validation) and the boundary checker.
- `pnpm test:e2e`: 59 cross-service tests, 13 of them new.
- `pnpm screenshots m6`: every member screen for all five personas, plus every admin page at desktop width. No serious or critical axe findings.

### M5 follow-ups

1. **New-vehicle cover is now a cover check on the car, not an assumption.**
   - The `new_vehicle` scenario takes `dealerCover`: `comprehensive` (the default) or `third_party`.
   - **With policies linked through AA**, CRED reads the car's actual policy. Comprehensive cover means nothing is suggested (decision `already_covered`). Third-party only means the cheapest way to add own-damage cover, with the headline "Cover check on your new car: damage to the car itself isn't covered…".
   - **Without a link**, CRED doesn't guess. It records `needs_data` and sends an alert, "New car? Check its cover", which opens a short form: car, price, and what cover came with it. A suggestion follows only if there's a real gap. "Not sure" tells the member where to look on the dealer's papers.
   - **Engine fix along the way:** a car trigger used to fall back to the health gap when no motor policy was known. It now asks instead.
2. **`insurance_data` is asked for only on the member's move.** It is granted only when the member approves a policy link on SimAA (Protect → Link your policies). I audited every path:
   - No proactive trigger prompts for it.
   - The proactive "not linked" explanation no longer nudges the member to link; the member-initiated one still tells them how.
   - E2e asserts that a car check, a renewal and a member-initiated check never create the permission or a prompt.
3. **The wellness reward is applied at renewal.**
   - With `health_data` on, CRED shares one number with the insurer of a floater bought through CRED: the four-week average activity score.
   - The insurer's `renewal_due` webhook now carries the base premium, the discount and the premium due.
   - On the renewal date the insurer collects the discounted premium and sends `insurer.policy.renewed`.
   - CRED shows "Saved ₹X at your renewal" on Wellness, with an alert. Priya's floater renews on 25 Nov, so one advance shows it.
4. **Early repayment.** Loans → Repay early lets the member repay part or all.
   - The lender quotes the charges (nil, as every key facts statement says), the interest saved, and the new end date. A part payment keeps the EMI and shortens the loan.
   - The member pays from their bank. The lender confirms with `lender.loan.prepaid`; CRED updates the schedule and shows the interest saved on the loan.
   - A repayment the account can't cover is refused by the lender, and nothing changes.

### What was built

- **CRED privacy area** (Profile → Privacy):
  - **Permissions dashboard:** every permission, including `insurance_data`, plus every active Account Aggregator link, each with one-tap "Turn off" or "Unlink and delete".
  - **What CRED knows about me:** each section with its source and the permission behind it, plus what CRED never holds.
  - **Your data and decisions.**
  - **Download my data** as JSON.
  - **Delete my data**, with typed confirmation:
    - it first revokes consents and unlinks the health app at the source;
    - it then deletes CRED's data and anonymises the member;
    - it keeps loans and policies held with partners (and their decisions), the audit log and complaints, and the screen lists what was kept and why.
  - Every action is audited: `privacy.viewed_what_cred_knows`, `privacy.downloaded`, `privacy.deleted`, and the permission actions.
- **Help and complaints** (Profile): members raise a concern by category. Admin replies, and the member sees the reply.
- **Admin console**, with sidebar navigation in the admin theme. Every page refreshes live over SSE.
  - **Overview:**
    - KPIs: member gains, shown → accepted, decided not to offer, open complaints.
    - The offer funnel by feature: decisions, offers, awaiting permission, shown, accepted, dismissed, expired, help, available, and not offered by reason.
    - Member gains by source.
    - Defaults and strain: overdue EMIs, 90+ days past due, default rate, missed card bills, members getting help.
    - The latest decisions, with checks next to what the member was told.
  - **Members** (with a drill-down per member), **Transactions**, and **Decisions** (filter by feature and outcome).
  - **Complaints**, resolved with a reply.
  - **Permissions & audit**, and **Partners & webhooks**: every call CRED made out and every signed webhook in.
  - **Rule settings**, editable live:
    - values entered in human units (%, ₹, ×);
    - each rule has a range, and changes are also checked against the rules they depend on (lowest rate ≤ highest; wellness tiers rising; equity loan-to-value ≤ debt);
    - a reason is required for every change;
    - every change is logged with from, to and the reason;
    - one-click reset to defaults (also logged).
- **Control room** (`/demo`):
  - service status;
  - persona picker plus "Show on phone" (the CRED app switches);
  - a trigger button for every feature, grouped 1–8, using world events on ecosystem-api and member actions on cred-api;
  - advance a month;
  - reset demo, which resets both worlds and the rule settings;
  - a log of what you fired.
- **EMIs can bounce.** When the account can't cover an EMI, it stays overdue, is retried next month, and the member gets a supportive alert. This is what the admin "defaults" figures count.

### Decisions I made on my own

| Decision | Why |
|---|---|
| **Member-side triggers in the control room go through cred-api's own public API**, acting as the member with a session token (`/sim/member-actions`, DEMO_MODE only) | Paying part of a bill or starting a sale happens in the app, not the world. Going through the real endpoints means every rule and log applies. |
| **The control room can approve a persona's pending AA requests** (`/sim/v1/aa/approve`, DEMO_MODE) | It stands in for the member tapping Approve on SimAA, so "verify salary" and "link portfolio" work from one button. The real page is still what members use. |
| **Prepayment charges are nil on every loan** | The key facts already promised "Foreclosure charges: Nil". A charge now would contradict them. The plumbing reports charges, so a lender could add them with matching key facts. |
| **Part prepayment keeps the EMI and shortens the loan** | It saves more interest than lowering the EMI, and it's the common default. The quote shows the new end date. |
| **Default = an EMI 90+ days past due** | The usual definition of a non-performing loan. Overdue EMIs and missed card bills are shown separately. |
| **Delete keeps loans and CRED-bought policies, their offers and decisions, the audit log and complaints**; everything else goes. The phone and name are anonymised. | The brief requires partner-held loans and policies to be kept. The audit log is what proves CRED acted with permission. |
| **Complaints were added** (member channel and admin queue) | The admin brief lists complaints, but there was no way for a member to raise one. |
| **Partner calls are logged** (`PartnerCall`) | Needed for "partner and webhook log": webhooks cover inbound only. |
| **An offer is "shown" from `shownAt`** (new column) | Statuses alone can't tell a dismissed Smart Savings prompt from a dismissed offer. |
| **The M3 e2e assertion `rules.editable === false` became `true`**, plus a range check | It documented the "read-only until M6" plan. M6 makes rules editable, so the old expectation no longer describes the product. This is the only change to an earlier test's expectation. |
| **The M5 Protect e2e passes `dealerCover: 'third_party'` explicitly, and the renewal alert assertion now expects the insurer's discount** | Both follow directly from follow-ups 1 and 3. The tests still check the same behaviour. |
| **The insurer's wellness score is seeded for Priya** | She already shares activity. Otherwise her first renewal would race the weekly summaries still in flight. |

### Deviations from plan

- The control room's admin calls go straight from the browser to each service's `/status` and `/sim` (the allowed exception), not through admin's own API.
- No e2e test makes an EMI bounce. No persona can be pushed short at month end without editing data by hand. The path is code-reviewed and covered by the overview's zero-default assertions.

### Known gaps

- Repayment plans for members who are struggling are still only explained, not created.
- There's no "documents pending" step in claims, and no top-up of pledged holdings after a collateral alert.
- Admin has no login (an internal console on localhost for the demo), so rule changes are logged as `admin`.
- Deleting data doesn't ask partners to delete; they keep what they hold under their own retention rules, as the screen says.

### Screenshots (`docs/screenshots/m6/`)

The M4 and M5 screenshots are regenerated alongside. New in M6:

| | | |
|---|---|---|
| `m6-01-privacy` | `m6-02-what-cred-knows` | `m6-03-permissions-aa-links` |
| `m6-04-delete` | `m6-05-repay-quote` | `m6-06-loan-after-repay` |
| `m6-07-alert-car-check` | `m6-08-car-cover-form` | `m6-09-car-cover-gap` |
| `m6-10-wellness-saved` | `m6-11-complaint-raised` | `m6-12-complaint-answered` |
| `m6-13-deleted-retained` | `m6-20-admin-overview` | `m6-21-admin-members` |
| `m6-22-admin-member-detail` | `m6-23-admin-transactions` | `m6-24-admin-decisions` |
| `m6-25-admin-audit` | `m6-26-admin-partners` | `m6-27-admin-rules` |
| `m6-28-admin-rule-invalid` | `m6-29-control-room` | `m6-30-admin-complaints` |
| `m6-31-control-room-fired` | | |

---

## M5 · The simulated clock and features 2–8

Tag `m5`. Gate at tag:
- `pnpm typecheck`: 11 packages.
- `pnpm test`: 175 unit tests and the boundary checker.
  - The engine has 118, up from 73, including two new fast-check properties at 3,000 runs each.
- `pnpm test:e2e`: 46 cross-service tests (23 new).
- `pnpm screenshots m5`: every screen passes for all five personas, with no serious or critical axe findings.

### What was built

**The M4 gap: statements close on the simulated clock**

- `POST /sim/v1/clock/advance` (ecosystem-api, DEMO_MODE only) plays out each month, day by day, at each institution:
  - salary, rent and spending in the bank account;
  - everyday card spend (each charge posted to CRED, so the engine sees it);
  - each persona's scripted bill habit;
  - statement close on the billing day, with 3.5% a month plus GST on anything carried;
  - EMI collection;
  - weekly activity summaries;
  - renewal notices and claim progress;
  - fund NAVs, with SimAA telling CRED that new data is ready.
- Every one of these reaches CRED by signed webhook, then `sim.clock.advanced`.
- CRED then applies due dates. Each bill becomes *paid in full*, *part paid* or *missed* (overdue). That moves the **Earned Credit Ladder**: streaks grow, members move up tiers (with an alert), and a missed bill steps them down one.

**Features, each from its real trigger, all through the engine**

| # | Feature | Trigger | What happens | Blocked cases tested |
|---|---|---|---|---|
| 2 | Wealth-Backed Liquidity | Member taps *Sell some* on a fund, FD or gold | Sell (gains tax, FD penalty, returns given up) vs borrow (interest, fee, GST), in rupees. When borrowing costs less it's an offer: key facts mention the lien → Keystone Capital pledges the units → money to the bank. Selling stays one tap ("Sell anyway"). `market_fall` scenario: funds −15%, AA refresh, a calm market-fall alert, and the lender's collateral alert | Above the loan-to-value cap (no loan, sell); stressed (help); one active offer |
| 3 | Earned Credit Ladder | Bills settling on the clock | Tier, streak, progress to the next tier ("1 more bill in full"), every tier's limit and rate, recent bills and whether they counted. The limit is shown as available, never pushed; unlocks are `available` decisions, not offers | Part payment resets the streak; missed bill steps down; hidden while clearing a balance |
| 4 | Family Health Insurance + Wellness | Member adds parents or children, picks who to cover | The insurer quotes two ways: add them to the current floater (re-priced on the eldest) vs a separate floater, or one base policy vs base + super top-up. Cheaper one recommended; waiting periods on the quote and in the key facts; proposal with OTP → premium collected → policy issued by webhook. Health app link (Apple Health / Health Connect) only after an explicit choice; CRED gets weekly summaries; reward up to 10% of the premium | Stressed member (help); no saving between the two ways (no offer); premium above share of income |
| 5 | Salary-Verified Credit | Member taps *Verify your salary* | SimAA consent page (choose the account) → CRED reads 6 months once, keeps only salary, employer and months → limit ₹3L→₹5L, rate −1% (lenders price verified salary lower). Recorded as `available`; no offer is started | Rejected at SimAA (nothing changes); withdraw deletes it |
| 6 | Protection-Gap Engine + Claims Concierge | Insurer renewal notice; a new car (card booking + dealer's third-party-only policy) | Reads cover via AA including employer cover (flagged: ends if you change jobs), compares with ₹10L suggested, recommends the cheapest way to close it (super top-up vs second base; standalone own-damage vs comprehensive); nothing if covered. Claims filed through CRED; insurer status updates arrive by webhook with alerts and a timeline | Covered (nothing); policies not linked (we say so); claim above cover |
| 7 | Wealth Management | Member links a portfolio via AA | Holdings, total, gain, mix, fees in rupees ("CRED earns none of it"), gold declared by the member, goals with a monthly plan net of fees. No offer or decision anywhere in it | Past goal date; linked holdings can't be deleted by hand |
| 8 | Card-Balance Switch | Member pays part of a bill in CRED | After the payment goes through, the engine offers moving the rest to a 6-month EMI ("If you carry the remaining ₹37,166 …"), with pay-in-full ₹0 first. The lender clears the bill; the rate steps 17% → 16% → 15% after 2 and 4 on-time EMIs (re-priced by webhook, with an alert) | Rohan (help); a small remainder (no signal); never repeated for the same bill |

**Screens** (M4 design system, supportive wording)

- **Home:** an alerts bell with an unread count, and a *Your money* row (Credit · Protect · Grow).
- **Credit:** the ladder, and salary verification.
- **Wealth:**
  - the portfolio and the link explainer;
  - holding detail;
  - *Sell some*, then *Sell or borrow?*;
  - adding gold;
  - goals.
- **Protect:**
  - the cover check;
  - policies, with employer cover flagged;
  - family, with the floater comparison;
  - wellness;
  - claims: the list, filing a claim, and the timeline.
- **Alerts.**
- **The return page from the Account Aggregator.**
- **Generalised to all the new features:** the offer page, key facts (loan, lien or insurance), the loan detail with the rate step-down, and the offer card.
- **Ecosystem:** SimAA's consent page, with nothing pre-ticked and Approve and Reject of equal weight.

### Decisions I made on my own

| Decision | Why |
|---|---|
| **Ladder rules:** a part payment resets the streak but keeps the tier; a missed bill steps down one tier | Deriving the tier only from the streak would drop a Gold member to Starter for one short month. That's harsh and would discourage part payments over missed ones. |
| **Tier unlocks and salary verification are recorded as a new outcome, `available`** | Both are decisions worth logging, but neither is an offer. Using `offer` would break "never pushed"; using `blocked` would be misleading. |
| **Insurance "net benefit" = the saving against the other way to get the same cover** | Cover itself can't be priced as a rupee gain honestly. Comparing two real insurer quotes keeps "net benefit or no offer" meaningful. The ₹0 "keep things as they are" option always comes first. |
| **New vehicle means motor cover:** the dealer sells third-party only; the gap is own-damage, closed by standalone own-damage or comprehensive | A gap check about a car should be about the car. It also shows "nothing if covered" for health at the same time. |
| **Gap check needs policies linked through AA** (new permission `insurance_data`); without it CRED says so and suggests nothing | CRED can't honestly claim a gap it can't see. Priya is seeded with this consent. |
| **Insurance and health premiums show GST ₹0** (individual health cover is GST-exempt from Sept 2025); motor shows 18% | Matches current rules. The key facts state it. |
| **Lender quotes carry one anonymous attribute, `incomeVerified`** (−1%) | Needed for "better rate" to be real. It's an attribute, not identity; member details still go only on accept. |
| **Loans against holdings: Keystone Capital at 10.5%, fee 0.5%**. CRED's loan-to-value caps are equity 50%, debt 75%, FD 85% and gold 65%; the lender's own caps are higher | "Conservative share of value". Two independent checks, like real life. |
| **Sell-side tax assumptions:** equity long-term gains at 12.5% after ₹1.25L a year, short-term at 20%; debt and short-term gold at a 30% slab; FD penalty 1% for the time held. All are rule settings, stated on screen | Real 2024+ rules, simplified (e.g. the exemption is assumed unused). |
| **Scripted bill habits pay only if the member didn't pay that cycle; short of cash they pay what they can** | Otherwise the clock would undo the member's own part payment (feature 8), and Kabir's flight month would look like "minimum only". |
| **Kabir's fixture:** the 60% month moved one cycle earlier | So a new part payment isn't read as a pattern (2 in 3 statements is a stress signal), and the switch can be shown. |
| **Member decision feed hides everyday purchases** (Big-Spend `no_signal`); admin keeps them | The clock now posts card spend every month; the member's "why" feed would drown in "looks like everyday spending". |
| **Market-fall alert is measured on prices (NAV before vs after), not the total** | A sale would otherwise look like a market fall. |
| **Services close each connection after responding** (service-kit) | Found by e2e. On Node 26, a keep-alive socket that answers while the process has outgoing fetches in flight parks the next request until the server's 30 s connection sweep. I proved it by shrinking the sweep to 2 s (the stall became 2.6 s). The fix is general and costs nothing on localhost; SSE is unaffected. The webhook outbox now also always reads response bodies. |
| **Proposals can cover several quotes with one OTP**, and can replace an existing floater | Base + top-up is bought together. "Add parents to my floater" replaces the old policy. |
| **Gold is valued at a public price constant**; gold "sales" update the member's own declaration | AA doesn't carry gold, and CRED can't sell gold the member holds. |

### Deviations from plan

- **Scenarios that are member actions are refused by ecosystem-api with 422** (`partial_bill_payment`, `fund_sale`). Those happen in the CRED app; the M6 control room can drive them through the app or cred-api.
- **The health-app page** (raw steps stay there) and **the insurer and fund house portals** are API-only; their pages are M7 ecosystem polish. The privacy point is shown in CRED: "receives only / never".
- **The wellness reward is shown and quoted at renewal**, not yet applied by the insurer to the renewal premium.

### Known gaps

- Claims don't model *documents pending*. The insurer moves filed → under review → approved → paid.
- No FD or gold loan e2e. Loans against FDs and gold are built and unit-tested; e2e covers funds.
- No exit loads in the sell comparison (AA mutual fund data doesn't carry them; seeded holdings are past the exit-load period).
- No early repayment or part-prepayment of loans, and no top-up of pledged holdings after a collateral alert. The alert suggests both.
- One card per persona still.
- The ladder shows recent bills only; there's no tier history.

### Screenshots (`docs/screenshots/m5/`)

All M4 screenshots are regenerated in the same folder. New in M5:

| | | |
|---|---|---|
| `m5-01-credit-ladder` | `m5-02-credit-hidden` (Rohan) | `m5-03-salary-explainer` |
| `m5-04-credit-gold` | `m5-05-alerts-ladder` | `m5-06-home-switch-offer` |
| `m5-07-switch-compare` | `m5-08-switch-key-facts` | `m5-09-switch-rate-stepped` |
| `m5-10-wealth` | `m5-11-wealth-empty` | `m5-12-holding` |
| `m5-13-sell-start` | `m5-14-sell-vs-borrow` | `m5-15-laf-compare` |
| `m5-16-laf-key-facts` | `m5-17-alerts-market-fall` | `m5-18-sell-only` |
| `m5-20-protect` | `m5-21-protect-unlinked` | `m5-22-floater-compare` |
| `m5-23-insurance-key-facts` | `m5-24-policy-issued` | `m5-25-wellness` |
| `m5-26-wellness-connect` | `m5-27-gap-renewal` | `m5-28-gap-topup` |
| `m5-29-home-motor-gap` | `m5-30-aa-consent` (ecosystem) | `m5-31-salary-verified` |
| `m5-32-credit-salary` | `m5-33-wealth-link` | `m5-34-gold` |
| `m5-35-goal-plan` | `m5-36-wealth-linked` | `m5-37-claim-new` |
| `m5-38-claim-timeline` | `m5-39-home-help-switch` | `m5-40-alerts-empty` |
| `m5-41-decisions` | | |

---

## M4 · CRED app shell, fully polished

Tag `m4`. Gate at tag: `pnpm typecheck` (11 packages), `pnpm test` (130 unit tests and the boundary checker), `pnpm test:e2e` (23 cross-service tests), and `pnpm screenshots m4`, which passes on every screen for all five personas with no serious or critical axe findings.

### What was built

**Design system (built first, everything else uses it)**

- **cred theme tokens** in `packages/ui/src/themes`:
  - Type scale: display, title, headline, body, callout, caption, overline.
  - Spacing: gutter, section, card.
  - Radius: sm to xl.
  - Elevation: e1 resting, e2 raised, e3 sheet. In dark mode this is an inset highlight plus a soft shadow.
  - Motion: 120, 200 and 320 ms, with standard and emphasized easing.
  - The other seven brands share the same base scale, with light-mode elevation.
- **Tailwind bridge** (`packages/ui/src/tailwind.css`) turns the tokens into utilities (`text-display`, `p-card`, `shadow-e2`, `animate-enter`, `transition-calm`). It also sets a focus ring and honours `prefers-reduced-motion`.
- **Shared components:**
  - Button and ButtonLink: at least 44px tall, with a loading state.
  - Card, Money (₹ in Indian format, tabular figures).
  - ListRow (at least 56px tall), List, SectionHeader, Avatar, Badge, ProgressBar (with aria labels).
  - Field (a label on every input, with hint and error), Choice (radio cards), Sheet (bottom sheet).
  - Skeleton, LoadingScreen, EmptyState, ErrorState, Notice, Spinner, and a small stroke icon set.
- **Motion is restrained:**
  - Screens fade up when they open.
  - Sheets slide up.
  - The success tick pops once.
  - Cards scale to 99% when pressed.
  - Nothing loops except the spinner.

**Screens** (390px phone frame, centred on desktop, tab bar for Home · Cards · UPI · Rewards · Profile)

| Screen | What it does |
|---|---|
| Sign-in | Persona picker, with loading and error states |
| Home | Greeting, rewards balance, upcoming bills with **one-tap Pay**, the active offer or Smart Savings card with "Why am I seeing this?", help card, cards summary with utilisation, EMIs, shortcuts to UPI and Rewards |
| Cards | Each card with due amount, due date, status and utilisation |
| Card detail | Card, outstanding, available and limit, latest statement with payments, recent transactions with **Convert to EMI** on eligible ones |
| Bill pay | Full is preselected; minimum or a custom amount; pay from UPI or net banking; honest interest note on partial payments; bank refusals shown as a clear message; confirmation screen with coins earned and the amount left |
| UPI | Look up a UPI ID (shows the registered name), people and shops (recent first), recent payments |
| UPI amount | Payee, amount (₹1 lakh cap), note; then the **UPI switch's own PIN page** in the ecosystem app; then the status screen in CRED (waiting, success with RRN, or failure with the reason) |
| Rewards | Coins balance, redeemable rewards (disabled and showing "N more" when short), confirm sheet, voucher code, earn/redeem history |
| Offer, key facts, EMI | Restyled: pay in full, card, EMI and loan options; key facts with an unticked checkbox and lender OTP; schedule with the next due date highlighted |
| Loans | Active loans with the next EMI, and the schedule |
| Profile | Details, "Your data and decisions", Permissions, Loans, Switch member |

**Backend, contracts first**

- **New contracts:**
  - Card gets `utilisationBps` and `nextDue`.
  - `GET /v1/cards/:id` (card detail).
  - `POST /v1/cards/:id/bill-payments` now takes a `source` and returns the updated card and coins earned.
  - `GET /v1/upi/contacts` and `GET /v1/upi/resolve`.
  - `GET /v1/rewards` and `POST /v1/rewards/redeem`.
  - The member gets `vpa`; home gets `simDate`.
  - On the ecosystem side: bank bill payment, UPI initiate, PIN challenge and PIN submit, and the `upi.transaction.completed` webhook.
- **Mock Bank** takes card bill payments from the member's own account. Partial payments are recorded as `custom` or `minimum`, and the statement becomes `partial` with the remainder still due. The bank refuses payments the account can't cover or that exceed the card balance.
- **UPI switch:**
  - Checks the payee exists.
  - Holds the payment until the PIN is entered on its own page.
  - Allows 3 PIN attempts.
  - Moves the money: debits the payer, and credits the payee if they bank with Mock Bank.
  - Tells CRED the result by signed webhook.
- **Rewards ledger** (`RewardEntry`): coins are earned per on-time bill payment, at a rate that is a rule setting (`rewardCoinsPer100Rupees`). Redemption debits coins and returns a voucher code.
- **Seed:** each persona has a rewards history and three past UPI payments, in both databases, so no screen opens empty by accident.

**The two fixes folded into M4**

1. **"Why we did or didn't suggest something" moved** off Home to Profile → "Your data and decisions". Home shows only the active offer with its "Why am I seeing this?".
2. **Supportive member wording:** every member-facing reason was rewritten (for example "We'll hold off on new credit while you clear your current balance. Here's a plan that could help."). Admin keeps the technical reason codes. The banned words ("stress", "risk", "blocked") are tested in three places:
   - a unit test over every reason code;
   - a fast-check property over 3,000 random cases;
   - a boundary-checker rule over the CRED app's displayed strings and JSX text.

**Tooling:** `pnpm screenshots <milestone>` resets the demo world, sweeps every screen for every persona, drives the flows, runs axe, and saves screenshots. It needs `pnpm dev` and a local Chrome.

### Decisions I made on my own

| Decision | Why |
|---|---|
| **One tap means:** Home's "Pay ₹X" opens bill pay with the full amount and UPI already selected; one more tap pays | Moving money on a single tap from Home with no confirmation risks accidental payments. Preselecting makes the flow two taps with no choices to make. |
| **Bill pay is synchronous** (BBPS-like): CRED calls the bank and records the result, with no UPI PIN step for bill pay | The brief puts the PIN screen under UPI pay. A PIN on bill pay as well would double the flow without adding to the demo. The source (UPI or net banking) is still recorded. |
| **A bank refusal is final; nothing is recorded** | The bank checks the member's account balance (Rohan has ₹6,200). That makes "insufficient funds" a real, testable state instead of every payment succeeding. |
| **Coins: 10 per ₹100 paid on time**, partial payments included; late payments earn nothing | Rewards payment behaviour, not borrowing. It's a rule setting so M6 can tune it. |
| **The seeded coin balance** is the persona's total, split into recent earned entries plus an "earlier bill payments" opening entry | Keeps the M1 persona balances while giving each persona a real-looking history. Kabir and Rohan come out higher than their M1 figures, because their recent on-time payments earn more than the old total. |
| **Contacts** are the other personas plus the seeded shops and people on UPI, with recent payees first | CRED has no real phone book. This is the smallest believable list. |
| **New records use simulated time** (UPI rows, reward entries, bill payments) | Mixing real time (31 Oct) with seeded sim time (2 Nov) made the newest payment sort below older ones. |
| **Partner 4xx errors pass through** cred-api with their own code and message; partner 5xx becomes 502 | Before this, "insufficient funds" reached the member as "Something went wrong". |
| **The webhook outbox tolerates rows deleted mid-delivery** and never lets a delivery error go unhandled | Found by e2e: a demo reset during delivery crashed ecosystem-api. |
| **Darkened ShopKart's green, red and amber and UPI's amber** | The extended contrast test (accent and status colours used as text, muted text on every surface) found them below 4.5:1. |
| **Next.js dev indicator turned off** in all apps | It overlapped the tab bar and Pay buttons in screenshots. Errors still show in the overlay. |
| **Help card says "coming soon"** for repayment plans | Members shouldn't see internal milestone language. |
| **The Profile tab replaced the Permissions link** in the header; Permissions lives under Profile | Matches the brief's structure and the M6 privacy area. |

### Deviations from plan

- **No PIN step for bill pay** (see above). UPI pay has the full PIN flow.
- **Ladder progression on payment is not updated yet.** Paying in full on time earns coins, but the credit ladder streak is still the seeded one. Streaks are counted when a statement closes, which arrives with the simulated clock in M5/M6.
- **Loading states:** every screen has one (skeletons), but they flash too briefly on a local machine for the sweep to capture, so there is no loading screenshot. Empty and error states are captured.

### Known gaps

- Only one card per persona, so the Cards list never shows several cards (the UI supports it).
- "Talk to us" and repayment plans on the help card are placeholders (planned for M5/M6).
- UPI collect requests and ShopKart UPI checkout aren't built (the gateway answers 501 for UPI); only CRED-initiated UPI pay is.
- Vouchers are display-only codes; nothing redeems them at the merchant.
- The phone frame is 390px; on very small screens (<360px) the four-option comparison stays readable but tight.
- `pnpm screenshots` needs a local Chrome; set `CHROME_PATH` if it isn't at the default macOS location.

### Screenshots (`docs/screenshots/m4/`)

| | | |
|---|---|---|
| `01-sign-in` | `02-home` | `03-cards` |
| `04-card-detail` | `05-bill-pay` | `06-bill-pay-custom` |
| `07-bill-paid-partial` | `08-card-part-paid` | `09-bill-pay-insufficient` |
| `10-upi` | `11-upi-amount` | `12-upi-pin` (ecosystem) |
| `13-upi-wrong-pin` | `14-upi-success` | `15-rewards` |
| `16-rewards-confirm` | `17-rewards-voucher` | `18-home-smart-savings` |
| `19-home-offer` | `19b-home-offer-why` | `20-compare` |
| `21-key-facts` | `22-key-facts-otp` | `23-emi-schedule` |
| `24-loans-empty` | `25-profile` | `26-data-empty` |
| `27-permissions` | `28-error-state` | `29-home-help` |
| `persona-priya-home` | `persona-sneha-home` | `persona-kabir-home` |
| `persona-rohan-home` | | |
