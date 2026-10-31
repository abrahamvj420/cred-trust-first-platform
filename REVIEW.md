# Review log

One section per milestone from M4 onward: what was built, decisions taken without asking (and why), deviations from the plan, known gaps, and screenshots.

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
