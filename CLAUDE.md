# CLAUDE.md

Context for Claude Code sessions in this repo.

## Project

Class prototype for **Business in the Digital Age (SPJIMR)**, built around CRED.

- All data is **synthetic**. No real APIs, payments or personal data, ever.
- Built in **2 days**. Favour a working, polished demo over production completeness. Mock freely, but keep the business logic honest.
- No CRED logos or trademarks.

## Core idea

One **shared offer engine** that every product feature goes through. Every offer must pass three checks, in this order:

1. **Permission given**: the member asked for it, or has granted Smart Savings.
2. **No financial-stress signal**: e.g. missed or partial payments, high utilisation, a falling balance.
3. **Member gains money**: a net benefit greater than zero, **shown in rupees**.

If any check fails, show **no offer**. If the member is stressed, show **repayment help** in place of credit.

## Features (priority order)

1. **Big-Spend Support**: an unusually large purchase leads to a cheaper EMI or pre-approved loan, compared with keeping it on the card.
2. **Wealth-Backed Liquidity**: when a member starts selling funds, FDs or gold, show sell vs borrow (tax, lost returns, interest).
3. **Earned Credit Ladder**: visible credit tiers unlocked by on-time payments. Shown as available, never pushed.
4. **Family Health Insurance with Wellness Rewards**: family floaters. A summary activity score (Apple Health / Google Health Connect, mocked) earns small premium rewards.
5. **Salary-Verified Credit**: the member verifies income (mocked account aggregator) and gets better limits and rates.
6. **Protection-Gap Engine with Claims Concierge**: reads existing cover, including employer cover, recommends the cheapest way to close the gap, and tracks claims.
7. **Wealth Management**: portfolio tracking and goal-based plans, with fees disclosed.
8. **Card-Balance Switch**: when a card bill is paid only in part, offer a cheaper EMI whose rate steps down for on-time payments.

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

## Key numbers for demo maths

- Card interest: **3.5% per month**, plus **18% GST on the interest**.
- Partner EMI: **16–18% p.a.**
- Processing fee: **1%**.
- Sanity check: on **₹1 lakh over 12 months**, the member saves about **₹17,300–18,500** by moving from card to EMI.

Keep these in a single config/constants module so every feature uses the same numbers.

## Design

- Premium, dark and minimal, with a CRED-like feel but **no CRED logos or trademarks**.
- All money in **₹ with Indian number formatting** (e.g. ₹1,00,000, ₹17,300; use `en-IN` locale).
- Every offer card shows the rupee saving prominently, plus a clear "No thanks" of equal weight.
