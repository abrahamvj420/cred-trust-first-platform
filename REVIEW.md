# Review log

One section per milestone from M4 onward: what was built, decisions taken without asking (and why), deviations from the plan, known gaps, and screenshots.

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
