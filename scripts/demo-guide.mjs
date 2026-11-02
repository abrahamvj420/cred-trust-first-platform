/**
 * Runs the presentation journeys in docs/DEMO-GUIDE.md in headless Chrome, with real
 * clicks from a fresh reset, and saves the guide's screenshots.
 *
 *   pnpm demo            (in another terminal)
 *   node scripts/demo-guide.mjs [journey numbers, e.g. 1 3]
 *
 * After each step it prints the URL and what's on screen. Exits non-zero if a step fails.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs/screenshots/demo-guide');
if (process.argv.length === 2) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const CRED = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';
const SHOP = 'http://localhost:3002';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const only = process.argv.slice(2).map(Number);
const CHARS = Number(process.env.GUIDE_CHARS ?? 700);

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const pageErrors = [];
let page;
/** Each journey gets a fresh tab, so one crashed renderer can't take the rest down. */
async function freshTab() {
  if (page && !page.isClosed()) await page.close().catch(() => undefined);
  page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setViewport(PHONE);
}
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2 };
const DESK = { width: 1280, height: 860, deviceScaleFactor: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`Timed out: ${what}\nOn ${page.url()}:\n${await text().catch(() => '')}`);
}
const text = () => page.evaluate(() => document.body.innerText);
const see = (t, ms) => until(async () => (await text()).toLowerCase().includes(t.toLowerCase()), `to see "${t}"`, ms);
const gone = (t, ms) => until(async () => !(await text()).toLowerCase().includes(t.toLowerCase()), `"${t}" to go`, ms);
async function go(url, view = url.startsWith(CRED) ? PHONE : DESK) {
  await page.setViewport(view);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(500);
}
/** Click the smallest visible control whose text contains `label`; retried, since a click before hydration does nothing. */
async function click(label, { selector = 'button, a, label, summary', then } = {}) {
  const once = () =>
    page.evaluate(
      (l, s) => {
        const hits = [...document.querySelectorAll(s)].filter((e) => e.textContent.toLowerCase().includes(l.toLowerCase()) && !e.disabled && e.getClientRects().length);
        if (!hits.length) return false;
        hits.sort((a, b) => a.textContent.length - b.textContent.length)[0].click();
        return true;
      },
      label,
      selector,
    );
  await until(once, `to click "${label}"`);
  if (then) {
    await until(
      async () => {
        if ((await text()).toLowerCase().includes(then.toLowerCase())) return true;
        await once();
        await sleep(600);
        return false;
      },
      `"${then}" after clicking "${label}"`,
    );
  }
  await sleep(350);
}
async function fill(label, value) {
  await until(
    () =>
      page.evaluate(
        (l, v) => {
          // The closest label with a text box (a radio labelled "Another amount" isn't the Amount field)
          const pairs = [...document.querySelectorAll('label')]
            .filter((x) => x.textContent.toLowerCase().includes(l.toLowerCase()))
            .map((x) => ({ x, input: document.getElementById(x.htmlFor) ?? x.querySelector('input') }))
            .filter(({ input }) => input && !['radio', 'checkbox'].includes(input.type))
            .sort((p, q) => p.x.textContent.length - q.x.textContent.length);
          const input = pairs[0]?.input;
          if (!input) return false;
          Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, v);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        },
        label,
        value,
      ),
    `to fill "${label}"`,
  );
  await sleep(150);
}
let stepNo = 0;
async function step(name, shot) {
  await sleep(500);
  const t = (await text()).replace(/\n{2,}/g, '\n').replace(/\n/g, ' | ');
  console.log(`\n[${name}] ${page.url()}\n  ${t.slice(0, CHARS)}`);
  if (shot) {
    const view = page.viewport();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...view, height: Math.min(Math.max(view.height, h), 3200) });
    await sleep(200);
    await page.screenshot({ path: path.join(OUT, `${shot}.png`) });
    await page.setViewport(view);
  }
  stepNo++;
}

// ── Common moves ────────────────────────────────────────────────────────────
let consoleIn = false;
async function resetDemo() {
  await go(`${ADMIN}/demo`);
  if (!consoleIn) {
    await until(() => page.evaluate(() => location.pathname === '/login' || !!document.querySelector('main')), 'console');
    if (page.url().includes('/login')) {
      await fill('Email', 'ops@cred.example');
      await fill('Password', 'trust-first-demo');
      await click('Sign in', { selector: 'button' });
      await until(() => page.evaluate(() => location.pathname !== '/login'), 'signed in');
      await go(`${ADMIN}/demo`);
    }
    consoleIn = true;
  }
  await click('Reset demo', { selector: 'button', then: 'both worlds reset' });
}
async function controlRoom(person, ...buttons) {
  await go(`${ADMIN}/demo`);
  await click(person, { selector: 'label' });
  for (const b of buttons) {
    const before = await page.evaluate(() => document.querySelectorAll('ol li').length);
    await click(b, { selector: 'button' });
    await until(() => page.evaluate((n) => document.querySelectorAll('ol li').length > n && ![...document.querySelectorAll('button')].some((x) => x.disabled && x.textContent.includes('Reset demo')), before), `control room: ${b}`, 60000);
    await sleep(1500); // webhooks arrive
  }
}
async function signIn(firstName) {
  await go(`${CRED}/status`);
  await page.evaluate(() => localStorage.clear());
  await go(`${CRED}/`);
  await click(firstName, { selector: 'button, a', then: 'Good ' });
}
async function buy(person) {
  await go(`${SHOP}/`);
  await until(() => page.evaluate(() => !!document.querySelector('#persona')), 'shopper switch');
  await page.select('#persona', person);
  await click('Switch', { selector: 'button' });
  await sleep(800);
}
const at = (frag, ms) => until(() => page.evaluate((f) => location.href.includes(f), frag), `to reach ${frag}`, ms);
const PAGES = { 1: journey1, 2: journey2, 3: journey3, 4: journey4, 5: journey5, 6: journey6, 7: journey7, 8: journey8 };
const tick = (label) => click(label, { selector: 'label' });

/** ShopKart: pick the shopper, buy the product by card, approve at Mock Bank. */
async function shopByCard(person, productLabel, prefix) {
  await buy(person);
  if (prefix) await step(`${prefix} ShopKart, shopper chosen`, `${prefix}-shopkart`);
  await click(productLabel, { selector: 'a', then: 'Add to cart' });
  if (prefix) await step(`${prefix} product`, `${prefix}-product`);
  await click('Buy now', { selector: 'button' });
  await at('/checkout');
  await see('Payment');
  await click('Credit or debit card', { selector: 'label' });
  await click('(saved)', { selector: 'label' });
  if (prefix) await step(`${prefix} checkout`, `${prefix}-checkout`);
  await click('Pay ', { selector: 'button' });
  await at('/bank/otp/');
  await see('Enter the 6-digit OTP');
  await fill('6-digit OTP', '123456');
  if (prefix) await step(`${prefix} Mock Bank OTP`, `${prefix}-bank-otp`);
  await click('Confirm payment', { selector: 'button' });
  await at('/order');
  if (prefix) await step(`${prefix} order placed`, `${prefix}-order`);
}

// ── Journeys ────────────────────────────────────────────────────────────────
async function journey1() {
  await resetDemo();
  await signIn('Aarav');
  await step('1.0 CRED home before', 'j1-00-home-before');
  // A second tab stays open on Home, as it will in the room: the card must arrive with no reload
  const phone = await browser.newPage();
  await phone.setViewport(PHONE);
  await phone.goto(`${CRED}/`, { waitUntil: 'domcontentloaded' });
  await until(async () => (await phone.evaluate(() => document.body.innerText)).toLowerCase().includes('upcoming'), 'the open CRED tab');
  await sleep(1500);
  await shopByCard('aarav', 'Aero 14', 'j1-01');
  await until(async () => (await phone.evaluate(() => document.body.innerText)).includes('Turn on'), 'Smart Savings to arrive live in the open tab');
  console.log('\n[1.2a] Smart Savings card arrived live in the already-open CRED tab, with no reload.');
  await phone.close();
  await go(`${CRED}/`);
  await see('Turn on');
  await step('1.2 Smart Savings card', 'j1-02-smart-savings');
  await click('Why am I seeing this', { selector: 'button, summary, a' });
  await step('1.2b why', null);
  await click('Turn on', { selector: 'button' });
  await see('No thanks');
  await step('1.3 offer card', 'j1-03-offer');
  await click('Compare', { selector: 'a, button' });
  await at('/offers/');
  await see('Your options');
  await step('1.4 options', 'j1-04-options');
  await click('EMI', { selector: 'a' });
  await at('/key-facts');
  await see('Key facts');
  await step('1.5 key facts', 'j1-05-key-facts');
  await click('', { selector: 'label' });
  await sleep(300);
  await click('Accept', { selector: 'button' });
  await see('enter the 6-digit OTP');
  await step('1.6 e-sign', 'j1-06-esign');
  await fill('enter the 6-digit OTP', '123456');
  await click('Confirm', { selector: 'button' });
  await at('/loans/');
  await see('EMI');
  await step('1.7 schedule', 'j1-07-schedule');
  await go(ADMIN);
  await click('Decisions', { selector: 'nav a, aside a, a' });
  await at('/decisions');
  await see('Aarav Mehta');
  await step('1.8 admin decisions', 'j1-08-admin-decisions');
}
async function journey2() {
  await resetDemo();
  await signIn('Aarav');
  await shopByCard('aarav', 'Studio 27', null);
  await go(`${CRED}/`);
  await sleep(2500);
  await step('2.1 home, no offer', 'j2-01-home-no-offer');
  await click('Profile', { selector: 'nav a' });
  await at('/profile');
  await click('Your data and decisions', { selector: 'a' });
  await at('/profile/data');
  await see('Nothing suggested');
  await step('2.2 why', 'j2-02-decision');
  await go(`${CRED}/`);
  await click('Cards', { selector: 'nav a' });
  await at('/cards');
  await click('4821', { selector: 'a' });
  await at('/cards/');
  await see('Recent transactions');
  await step('2.3 card detail', 'j2-03-card');
  await click('Convert to EMI', { selector: 'button, a' });
  await at('/offers/');
  await see('Your options');
  await step('2.4 options', 'j2-04-options');
  await click('EMI', { selector: 'a' });
  await at('/key-facts');
  await see('Key facts');
  await click('', { selector: 'label' });
  await sleep(300);
  await click('Accept', { selector: 'button' });
  await see('enter the 6-digit OTP');
  await fill('enter the 6-digit OTP', '123456');
  await click('Confirm', { selector: 'button' });
  await at('/loans/');
  await see('EMI');
  await step('2.5 schedule', 'j2-05-schedule');
}
async function journey3() {
  await resetDemo();
  await signIn('Rohan');
  await step('3.0 home before', null);
  await shopByCard('rohan', 'Aero 14', null);
  await go(`${CRED}/`);
  await see('See a plan');
  await step('3.1 help card', 'j3-01-help-card');
  await go(ADMIN);
  await click('Decisions', { selector: 'a' });
  await at('/decisions');
  await see('Rohan Das');
  await step('3.2 admin decision', 'j3-02-admin-decision');
  await go(`${CRED}/`);
  await click('See a plan', { selector: 'a, button' });
  await at('/repayment-plan');
  await see('Over how long');
  await step('3.3 plan options', 'j3-03-plan-options');
  await click('6 months', { selector: 'label' });
  await click('I understand', { selector: 'label' });
  await step('3.4 chosen', null);
  await click('Set up', { selector: 'button' });
  await see('enter the 6-digit OTP');
  await step('3.5 otp', 'j3-04-plan-otp');
  await fill('enter the 6-digit OTP', '123456');
  await click('Confirm', { selector: 'button' });
  await at('/loans/');
  await step('3.6 plan in loans', 'j3-05-plan-loan');
  await go(`${CRED}/`);
  await click('Cards', { selector: 'nav a' });
  await at('/cards');
  await see('Outstanding');
  await step('3.7 card after', 'j3-06-card-after');
  await go(`${CRED}/`);
  await click('Credit', { selector: 'a[href="/credit"]' });
  await at('/credit');
  await see('Earned Credit Ladder');
  await step('3.8 credit', 'j3-07-credit');
  await go('http://localhost:3003/bank?c=per_rohan');
  await see('Rohan');
  await step('3.9 Mock Bank portal', 'j3-08-mock-bank');
  await go(ADMIN);
  await click('Partners & webhooks', { selector: 'a' });
  await at('/partners');
  await see('bank.card.payment.received');
  await step('3.10 webhook log', 'j3-09-webhook-log');
}
async function journey4() {
  await resetDemo();
  await signIn('Priya');
  await click('Protect', { selector: 'a[href="/protect"]' });
  await at('/protect');
  await see('Your policies');
  await step('4.0 protect', 'j4-01-protect');
  await click('Family', { selector: 'a' });
  await at('/protect/family');
  await see('Add someone');
  await step('4.1 family', null);
  for (const [name, age] of [['Gopal Menon', '68'], ['Lakshmi Menon', '64']]) {
    await click('Add someone', { selector: 'button' });
    await see('They are your');
    await fill('Name', name);
    await fill('Age', age);
    await click('Parent', { selector: 'label' });
    await step(`4.2 adding ${name}`, name.startsWith('Gopal') ? 'j4-02-add-parent' : null);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].filter((x) => /add/i.test(x.textContent) && !x.disabled).pop();
      b.click();
    });
    await gone('They are your');
    await see(name);
  }
  await click('Gopal Menon', { selector: 'label' });
  await click('Lakshmi Menon', { selector: 'label' });
  await click('₹5 lakh', { selector: 'label' });
  await step('4.3 chosen', 'j4-03-compare');
  await click('Compare', { selector: 'button' });
  await see('Two ways to cover them', 30000);
  await step('4.4 two quotes', 'j4-04-two-quotes');
  await go(`${CRED}/`);
  await click('Protect', { selector: 'a[href="/protect"]' });
  await at('/protect');
  await click('Wellness rewards', { selector: 'a' });
  await at('/protect/wellness');
  await see('Activity score');
  await step('4.5 wellness before', 'j4-05-wellness');
  await controlRoom('Priya', 'Advance a month');
  await step('4.6 control room advanced', 'j4-06-advance');
  await go(`${CRED}/protect/wellness`);
  await see('Activity score');
  await step('4.7 wellness after 1 advance', 'j4-07-wellness-renewed');
  await go(`${CRED}/`);
  await click('', { selector: 'a[href="/alerts"]' });
  await at('/alerts');
  await see('renewed');
  await step('4.8 alerts', 'j4-08-alerts');
  await go(`${CRED}/protect`);
  await see('Your policies');
  await step('4.9 protect after', null);
}
async function journey5() {
  await resetDemo();
  await signIn('Sneha');
  await click('Grow', { selector: 'a[href="/wealth"]' });
  await at('/wealth');
  await see('Holdings');
  await step('5.1 wealth', 'j5-01-wealth');
  await click('Meridian Flexi', { selector: 'a' });
  await at('/wealth/holdings/');
  await see('Sell some');
  await step('5.2 holding', 'j5-02-holding');
  await click('Sell some', { selector: 'a' });
  await at('/sell');
  await see('See what it costs');
  await fill('How much do you need', '200000');
  await step('5.3 amount', 'j5-03-amount');
  await click('See what it costs', { selector: 'button' });
  await at('/wealth/sell/');
  await see('Borrow instead', 30000);
  await step('5.4 sell vs borrow', 'j5-04-sell-vs-borrow');
  await click('Borrow instead', { selector: 'a' });
  await at('/offers/');
  await see('Your options');
  await step('5.5 options', 'j5-05-options');
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.href.includes('/key-facts')).click());
  await at('/key-facts');
  await see('Key facts');
  await step('5.6 key facts', 'j5-06-key-facts');
  await click('', { selector: 'label' });
  await sleep(300);
  await click('Accept', { selector: 'button' });
  await see('enter the 6-digit OTP');
  await fill('enter the 6-digit OTP', '123456');
  await click('Confirm', { selector: 'button' });
  await at('/loans/');
  await step('5.7 loan', 'j5-07-loan');
  await controlRoom('Sneha', 'Market falls 15%');
  await step('5.8 control room', 'j5-08-control-room');
  await go(`${CRED}/`);
  await click('', { selector: 'a[href="/alerts"]' });
  await at('/alerts');
  await see('market', 15000);
  await step('5.9 alerts', 'j5-09-alert');
}
async function journey6() {
  await resetDemo();
  await signIn('Kabir');
  await step('6.0 home', 'j6-01-home');
  await click('Pay', { selector: 'a' });
  await at('/pay/');
  await see('How much');
  await step('6.1 pay screen', null);
  await click('Another amount', { selector: 'label' });
  await fill('Amount', '30000');
  await click('UPI', { selector: 'label' });
  await step('6.2 part payment', 'j6-02-part-payment');
  await click('Pay ', { selector: 'button' });
  await see('Payment successful', 30000);
  await step('6.3 success', 'j6-03-success');
  await click('Done', { selector: 'a, button' });
  await see('EMI saves', 30000);
  await step('6.4 offer', 'j6-04-offer');
  await click('Compare', { selector: 'a, button' });
  await at('/offers/');
  await see('Your options');
  await step('6.5 options', 'j6-05-options');
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.href.includes('/key-facts')).click());
  await at('/key-facts');
  await see('Key facts');
  await step('6.6 key facts', 'j6-06-key-facts');
  await go(ADMIN);
  await click('Decisions', { selector: 'a' });
  await at('/decisions');
  await see('Kabir Singh');
  await step('6.7 admin decision', 'j6-07-admin-decision');
}
async function journey7() {
  await resetDemo();
  await controlRoom('Kabir', 'Pay part of the bill');
  await step('7.0 control room', null);
  await signIn('Kabir');
  await see('EMI saves');
  await step('7.1 home with an offer', 'j7-01-home-offer');
  await click('Profile', { selector: 'nav a' });
  await at('/profile');
  await see('Privacy');
  await click('Privacy', { selector: 'a' });
  await at('/profile/privacy');
  await see('What CRED knows about me');
  await step('7.2 privacy', 'j7-02-privacy');
  await click('Permissions', { selector: 'a' });
  await at('/permissions');
  await see('Smart Savings');
  await step('7.3 permissions', 'j7-03-permissions');
  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('button')].find((b) => /turn off/i.test(b.textContent) && b.parentElement.closest('div,section,li')?.parentElement?.textContent.includes('Smart Savings') && b.closest('div').textContent.includes('Smart Savings'));
    row?.click();
    return !!row;
  });
  if (!clicked) throw new Error('No Turn off button for Smart Savings');
  await see('Turned off');
  await step('7.4 off', 'j7-04-permission-off');
  await go(`${CRED}/`);
  await gone('EMI saves', 8000);
  await step('7.5 home, offer gone', 'j7-05-home-after');
  await click('Profile', { selector: 'nav a' });
  await at('/profile');
  await click('Privacy', { selector: 'a' });
  await at('/profile/privacy');
  await click('What CRED knows about me', { selector: 'a' });
  await at('/knows');
  await see('never holds');
  await step('7.6 knows', 'j7-06-knows');
  await go(`${CRED}/profile/privacy`);
  await click('Your data and decisions', { selector: 'a' });
  await at('/profile/data');
  await see('recorded here');
  await step('7.7 decisions', 'j7-07-decisions');
  await go(ADMIN);
  await click('Permissions & audit', { selector: 'a' });
  await at('/audit');
  await see('permission.withdrawn');
  await step('7.8 audit', 'j7-08-admin-audit');
}
async function journey8() {
  await resetDemo();
  await go(ADMIN);
  await see('Offer funnel');
  await step('8.0 overview fresh', null);
  await controlRoom('Aarav', '₹1.5L laptop on the card', '₹1.5L laptop on the card');
  await controlRoom('Rohan', '₹1.5L laptop on the card');
  await controlRoom('Sneha', '₹1.5L laptop on the card');
  await controlRoom('Priya', 'New car, comprehensive');
  await step('8.1 fired', 'j8-01-control-room');
  console.log(await page.evaluate(() => [...document.querySelectorAll('ol li')].map((l) => l.textContent).join('\n')));
  await go(ADMIN);
  await see('Offer funnel');
  await step('8.2 overview', 'j8-02-overview');
  console.log(await page.evaluate(() => [...document.querySelectorAll('table')][0]?.innerText));
  await click('Rule settings', { selector: 'a' });
  await at('/rules');
  await see('Minimum big purchase');
  await page.evaluate(() => {
    const title = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Minimum big purchase')[0];
    let n = title;
    while (n && ![...n.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Edit')) n = n.parentElement;
    [...n.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit').click();
  });
  await see('Reason (logged)');
  await step('8.3 editing', null);
  await fill('New value', '30000');
  await fill('Reason (logged)', 'Class demo: raising the big-purchase bar');
  await step('8.4 filled', 'j8-03-rule-edit');
  await click('Save', { selector: 'button' });
  await gone('Reason (logged)');
  await see('₹30,000');
  await step('8.5 saved', 'j8-04-rule-saved');
  await click('Permissions & audit', { selector: 'a' });
  await at('/audit');
  await see('rule.changed');
  await step('8.6 audit', 'j8-05-audit');
}

// ── Run ─────────────────────────────────────────────────────────────────────
let failed = false;
for (const n of Object.keys(PAGES).map(Number)) {
  if (only.length && !only.includes(n)) continue;
  console.log(`\n═════ Journey ${n} ═════`);
  try {
    await freshTab();
    await PAGES[n]();
  } catch (e) {
    failed = true;
    console.error(`\n✗ Journey ${n}: ${e.message}`);
  }
}
if (pageErrors.length) console.error('Page errors:', pageErrors);
await freshTab();
await resetDemo(); // leave a clean demo world
await browser.close();
console.log(failed || pageErrors.length ? '\n✗ Some journeys failed' : '\n✔ All journeys passed');
process.exit(failed || pageErrors.length ? 1 : 0);
