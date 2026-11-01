/**
 * Screen sweep + screenshots (needs `pnpm dev` running and a local Chrome).
 *
 *   pnpm screenshots m4
 *
 * Resets the demo world, then for every persona opens every member screen at
 * 390×844 and checks: no page errors, no error state, axe has no serious or
 * critical issues. Drives the key flows (bill pay, UPI with PIN, rewards,
 * offer → key facts → EMI) and saves screenshots to docs/screenshots/<milestone>/.
 * Exits non-zero on any failure.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
process.loadEnvFile(path.join(root, '.env'));
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const milestone = process.argv[2] ?? 'm4';
const OUT = path.join(root, 'docs/screenshots', milestone);
const CRED = 'http://localhost:3000';
const CRED_API = 'http://localhost:4000';
const ADMIN = 'http://localhost:3001';
const ECO_API = 'http://localhost:4100';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PERSONAS = ['aarav', 'priya', 'sneha', 'kabir', 'rohan'];

const failures = [];
const log = (...a) => console.log('•', ...a);

// ── API helpers (setup only; the UI is what's under test) ──────────────────
const STAFF = { email: 'ops@cred.example', password: 'trust-first-demo' };
let staffToken = null;
async function http(url, { method = 'GET', body, headers = {} } = {}) {
  // Console endpoints need the demo staff session
  if (url.includes('/admin/v1/') && !url.endsWith('/admin/v1/login')) {
    staffToken ??= (await http(`${CRED_API}/admin/v1/login`, { method: 'POST', body: STAFF })).token;
    headers = { ...headers, authorization: `Bearer ${staffToken}` };
  }
  const res = await fetch(url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const login = async (key) => (await http(`${CRED_API}/v1/auth/demo-login`, { method: 'POST', body: { personaKey: key } })).token;
const asMember = (token) => ({ authorization: `Bearer ${token}` });
const phoneOf = { aarav: '9000000001', priya: '9000000002', sneha: '9000000003', kabir: '9000000004', rohan: '9000000005' };

async function reset() {
  await http(`${ECO_API}/sim/v1/reset`, { method: 'POST' });
  await http(`${CRED_API}/sim/reset`, { method: 'POST' });
}

async function buy(key, amountPaise, item) {
  const m = { 'x-merchant-key': process.env.SHOPKART_MERCHANT_KEY };
  const { cards } = await http(`${ECO_API}/gateway/v1/shoppers/${phoneOf[key]}/saved-cards`, { headers: m });
  const created = await http(`${ECO_API}/gateway/v1/payments`, {
    method: 'POST',
    headers: m,
    body: { orderId: `SS-${key}-${Date.now()}`, amountPaise, description: item, shopperPhone: phoneOf[key], returnUrl: 'http://localhost:3002/order/x', instrument: { method: 'card', cardToken: cards[0].token } },
  });
  const authId = created.nextAction.url.split('/').at(-1);
  await http(`${ECO_API}/bank/v1/card-auth/${authId}/otp`, { method: 'POST', body: { otp: '123456' } });
}

/** Wait for every partner webhook to be delivered (and background engine runs to finish). */
async function drain() {
  await until(async () => (await http(`${ECO_API}/sim/v1/outbox`)).pending === 0, 'outbox drained', 20000);
  await new Promise((r) => setTimeout(r, 600));
}
const scenario = async (s, personaKey, dealerCover = 'comprehensive') => {
  await http(`${ECO_API}/sim/v1/scenarios`, { method: 'POST', body: { scenario: s, personaKey, dealerCover } });
  await drain();
};
const advance = async (months = 1) => {
  await http(`${ECO_API}/sim/v1/clock/advance`, { method: 'POST', body: { months } });
  await drain();
};

async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out: ${what}`);
}

// ── Browser helpers ─────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 60000 });
let page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
let pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

async function signIn(key) {
  const token = await login(key);
  await page.goto(`${CRED}/status`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('cred_demo_token', t), token);
  return token;
}

/** Wait until skeletons are gone and the screen has rendered. */
async function settle() {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      const ready = await page.evaluate(() => document.querySelector('main') && !document.querySelector('.animate-pulse, [aria-label^="Loading"]'));
      if (ready) break;
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 450)); // let entrance motion finish
}

async function axe(label) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'], rules: { region: { enabled: false } } });
    return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`);
  });
  for (const v of r) failures.push(`[axe] ${label}: ${v}`);
}

async function visit(url, label, { shot, expectError = false } = {}) {
  if (process.env.SHOTS_DEBUG) console.log('  →', label);
  pageErrors = [];
  // The dev server occasionally reloads a page mid-navigation (detached frame): retry
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await settle();
  await check(label, { shot, expectError });
}

async function check(label, opts = {}, attempt = 0) {
  try {
    return await checkOnce(label, opts);
  } catch (e) {
    // A freshly started dev server compiles routes on first visit and may reload the page mid-check
    if (attempt < 2 && /Execution context was destroyed|detached Frame/.test(String(e))) {
      await new Promise((r) => setTimeout(r, 1500));
      await settle();
      return check(label, opts, attempt + 1);
    }
    throw e;
  }
}

async function checkOnce(label, { shot, expectError = false } = {}) {
  const text = await page.evaluate(() => document.body.innerText);
  if (!expectError && text.includes('Something didn’t load')) failures.push(`${label}: shows an error state`);
  for (const e of pageErrors) failures.push(`${label}: page error: ${e}`);
  pageErrors = [];
  await axe(label);
  if (shot) await snap(shot);
}

/** Full-height capture: size the viewport to the page so sticky bars sit where a scrolled user sees them. */
async function snap(name) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ width: 390, height: Math.max(844, h), deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
}

async function clickText(text, selector = 'button, a, label') {
  await until(
    () =>
      page.evaluate(
        (t, s) => {
          const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t) && !e.disabled);
          if (!el) return false;
          el.click();
          return true;
        },
        text,
        selector,
      ),
    `click "${text}"`,
  );
}
// Case-insensitive: innerText applies CSS text-transform (overlines are uppercase)
const waitText = (t, ms = 15000) => until(() => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t), `text "${t}"`, ms);

// ── Run ─────────────────────────────────────────────────────────────────────
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
await reset();

// Signed-out
await page.goto(`${CRED}/status`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await visit(CRED, 'sign-in', { shot: '01-sign-in' });

// Every screen, every persona
for (const key of PERSONAS) {
  const token = await signIn(key);
  const { cards } = await http(`${CRED_API}/v1/cards`, { headers: asMember(token) });
  const first = key === 'aarav';
  await visit(`${CRED}/`, `${key} home`, { shot: first ? '02-home' : `persona-${key}-home` });
  await visit(`${CRED}/cards`, `${key} cards`, { shot: first ? '03-cards' : undefined });
  await visit(`${CRED}/cards/${cards[0].id}`, `${key} card detail`, { shot: first ? '04-card-detail' : undefined });
  await visit(`${CRED}/pay/${cards[0].id}`, `${key} bill pay`, { shot: first ? '05-bill-pay' : undefined });
  await visit(`${CRED}/upi`, `${key} upi`, { shot: first ? '10-upi' : undefined });
  await visit(`${CRED}/rewards`, `${key} rewards`, { shot: first ? '15-rewards' : undefined });
  await visit(`${CRED}/loans`, `${key} loans`, { shot: key === 'kabir' ? '24-loans-empty' : undefined });
  await visit(`${CRED}/profile`, `${key} profile`, { shot: first ? '25-profile' : undefined });
  await visit(`${CRED}/profile/data`, `${key} data and decisions`, { shot: key === 'kabir' ? '26-data-empty' : undefined });
  await visit(`${CRED}/permissions`, `${key} permissions`, { shot: key === 'sneha' ? '27-permissions' : undefined });
  // M5 screens
  await visit(`${CRED}/credit`, `${key} credit`, { shot: key === 'kabir' ? 'm5-01-credit-ladder' : key === 'rohan' ? 'm5-02-credit-hidden' : undefined });
  await visit(`${CRED}/credit/salary`, `${key} salary`, { shot: first ? 'm5-03-salary-explainer' : undefined });
  await visit(`${CRED}/wealth`, `${key} wealth`, { shot: key === 'sneha' ? 'm5-10-wealth' : first ? 'm5-11-wealth-empty' : undefined });
  await visit(`${CRED}/protect`, `${key} protect`, { shot: key === 'priya' ? 'm5-20-protect' : first ? 'm5-21-protect-unlinked' : undefined });
  await visit(`${CRED}/protect/family`, `${key} family`);
  await visit(`${CRED}/protect/wellness`, `${key} wellness`, { shot: key === 'priya' ? 'm5-25-wellness' : first ? 'm5-26-wellness-connect' : undefined });
  await visit(`${CRED}/protect/claims`, `${key} claims`);
  await visit(`${CRED}/alerts`, `${key} alerts`, { shot: first ? 'm5-40-alerts-empty' : undefined });
  // M6 screens
  await visit(`${CRED}/profile/privacy`, `${key} privacy`, { shot: first ? 'm6-01-privacy' : undefined });
  await visit(`${CRED}/profile/privacy/knows`, `${key} what cred knows`, { shot: key === 'priya' ? 'm6-02-what-cred-knows' : undefined });
  await visit(`${CRED}/permissions`, `${key} permissions m6`, { shot: key === 'priya' ? 'm6-03-permissions-aa-links' : undefined });
  await visit(`${CRED}/profile/privacy/delete`, `${key} delete`, { shot: first ? 'm6-04-delete' : undefined });
  await visit(`${CRED}/help`, `${key} help`);
  await visit(`${CRED}/protect/vehicle`, `${key} vehicle check`);
  log(`${key}: all screens render`);
}

// Error state
await signIn('aarav');
await visit(`${CRED}/cards/not-a-card`, 'error state', { shot: '28-error-state', expectError: true });

// Bill pay: custom amount (Kabir) → partial recorded
{
  const token = await signIn('kabir');
  const { cards } = await http(`${CRED_API}/v1/cards`, { headers: asMember(token) });
  await visit(`${CRED}/pay/${cards[0].id}`, 'kabir pay');
  await clickText('Another amount', 'label');
  await page.waitForSelector('input[inputmode=decimal]');
  await page.type('input[inputmode=decimal]', '20000');
  await settle();
  await check('bill pay custom', { shot: '06-bill-pay-custom' });
  await clickText('Pay ₹20,000', 'button');
  await waitText('Payment successful');
  await settle();
  await check('bill pay done', { shot: '07-bill-paid-partial' });
  await visit(`${CRED}/cards/${cards[0].id}`, 'kabir card after partial', { shot: '08-card-part-paid' });
  log('bill pay: partial payment recorded and shown');
}

// Bill pay refused (Rohan can't cover the full bill)
{
  const token = await signIn('rohan');
  const { cards } = await http(`${CRED_API}/v1/cards`, { headers: asMember(token) });
  await visit(`${CRED}/pay/${cards[0].id}`, 'rohan pay');
  await clickText('Pay ₹', 'button');
  await waitText('doesn’t have enough balance');
  await settle();
  await check('bill pay refused', { shot: '09-bill-pay-insufficient' });
  log('bill pay: insufficient funds shown kindly');
}

// UPI: Priya pays Meera through the switch's PIN page
{
  await signIn('priya');
  await visit(`${CRED}/upi/pay?vpa=meera.joshi%40mockbank&name=Meera%20Joshi`, 'upi amount');
  await page.type('input[inputmode=decimal]', '750');
  await page.type('input[maxlength="50"]', 'Movie night');
  await settle();
  await check('upi amount', { shot: '11-upi-amount' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Pay ₹750', 'button')]);
  await until(() => page.evaluate(() => !!document.querySelector('input[type=password]')), 'PIN page');
  await settle();
  await check('upi pin page', { shot: '12-upi-pin' });
  await page.type('input[type=password]', '0000');
  await clickText('Pay', 'button[type=submit]');
  await waitText('Incorrect UPI PIN');
  await check('upi wrong pin', { shot: '13-upi-wrong-pin' });
  await page.type('input[type=password]', '1234');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Pay', 'button[type=submit]')]);
  await waitText('UPI ref (RRN)', 20000);
  await settle();
  await check('upi success', { shot: '14-upi-success' });
  log('UPI: PIN page → success');
}

// Rewards: Sneha redeems
{
  await signIn('sneha');
  await visit(`${CRED}/rewards`, 'sneha rewards');
  await clickText('Redeem', 'button');
  await waitText('Redeem this reward?');
  await settle();
  await check('rewards confirm', { shot: '16-rewards-confirm' });
  await until(
    () => page.evaluate(() => {
      const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent === 'Redeem');
      b?.click();
      return !!b;
    }),
    'confirm redeem',
  );
  await waitText('Voucher ready to use');
  await settle();
  await check('rewards voucher', { shot: '17-rewards-voucher' });
  log('rewards: redeemed');
}

// Money moments: Aarav's laptop → Smart Savings → compare → key facts → OTP → EMI
{
  const token = await signIn('aarav');
  await page.goto(CRED, { waitUntil: 'domcontentloaded' });
  await settle();
  await buy('aarav', 1_50_000_00, 'Aero 14 Laptop');
  await waitText('Turn on', 20000);
  await settle();
  await check('smart savings card', { shot: '18-home-smart-savings' });
  await clickText('Turn on', 'button');
  await waitText('Compare', 15000);
  await settle();
  await check('offer card', { shot: '19-home-offer' });
  await clickText('Why am I seeing this?', 'summary');
  await snap('19b-home-offer-why');
  const offerId = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active.id;
  await visit(`${CRED}/offers/${offerId}`, 'compare', { shot: '20-compare' });
  await visit(`${CRED}/offers/${offerId}/key-facts?option=emi`, 'key facts', { shot: '21-key-facts' });
  await page.click('input[type=checkbox]');
  await clickText('Accept', 'button');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.type('input[autocomplete=one-time-code]', '654321');
  await settle();
  await check('lender otp', { shot: '22-key-facts-otp' });
  await clickText('Confirm and sign', 'button');
  await until(() => page.evaluate(() => location.pathname.startsWith('/loans/')), 'EMI schedule', 20000);
  await settle();
  await check('emi schedule', { shot: '23-emi-schedule' });
  log('money moment: offer → key facts → OTP → EMI schedule');
}

// Help card (Rohan after a big purchase)
{
  await signIn('rohan');
  await buy('rohan', 1_50_000_00, 'Aero 14 Laptop');
  await page.goto(CRED, { waitUntil: 'domcontentloaded' });
  await waitText('Here to help', 20000);
  await settle();
  await check('help card', { shot: '29-home-help' });
  log('help card shown for Rohan');
}

// ── M5 flows ────────────────────────────────────────────────────────────────

// Clock: Priya pays two more bills in full → Gold unlocked (shown as available, never pushed)
{
  await reset();
  await signIn('priya');
  await advance(2);
  await visit(`${CRED}/credit`, 'priya gold', { shot: 'm5-04-credit-gold' });
  await visit(`${CRED}/alerts`, 'priya alerts', { shot: 'm5-05-alerts-ladder' });
  log('clock: two months advanced, Gold unlocked');
}

// Card-Balance Switch: Kabir pays part of his bill in CRED
{
  await reset();
  const token = await signIn('kabir');
  const { cards } = await http(`${CRED_API}/v1/cards`, { headers: asMember(token) });
  await http(`${CRED_API}/v1/cards/${cards[0].id}/bill-payments`, { method: 'POST', headers: asMember(token), body: { kind: 'custom', amountPaise: 30_000_00, source: 'upi' } });
  await page.goto(CRED, { waitUntil: 'domcontentloaded' });
  await waitText('If you carry the remaining', 20000);
  await settle();
  await check('switch offer', { shot: 'm5-06-home-switch-offer' });
  const offerId = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active.id;
  await visit(`${CRED}/offers/${offerId}`, 'switch compare', { shot: 'm5-07-switch-compare' });
  await visit(`${CRED}/offers/${offerId}/key-facts?option=emi`, 'switch key facts', { shot: 'm5-08-switch-key-facts' });
  await page.click('input[type=checkbox]');
  await clickText('Accept', 'button');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.type('input[autocomplete=one-time-code]', '654321');
  await clickText('Confirm and sign', 'button');
  await until(() => page.evaluate(() => location.pathname.startsWith('/loans/')), 'switch schedule', 20000);
  await drain();
  await advance(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  await check('switch stepped down', { shot: 'm5-09-switch-rate-stepped' });
  log('card-balance switch: part payment → EMI → rate stepped down after 2 on-time EMIs');
}

// Wealth-Backed Liquidity: Sneha starts selling → sell vs borrow → borrow; then a market fall
{
  await reset();
  const token = await signIn('sneha');
  const { holdings } = await http(`${CRED_API}/v1/wealth/holdings`, { headers: asMember(token) });
  const fund = holdings.find((h) => h.name.startsWith('Meridian Flexi'));
  await visit(`${CRED}/wealth/holdings/${fund.id}`, 'holding', { shot: 'm5-12-holding' });
  await visit(`${CRED}/wealth/holdings/${fund.id}/sell`, 'start selling');
  await page.type('input[inputmode=numeric]', '200000');
  await settle();
  await check('start selling', { shot: 'm5-13-sell-start' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('See what it costs', 'button')]);
  await waitText('Borrow against it');
  await settle();
  await check('sell vs borrow', { shot: 'm5-14-sell-vs-borrow' });
  await clickText('Borrow instead', 'a');
  await waitText('Your options');
  await settle();
  await check('laf compare', { shot: 'm5-15-laf-compare' });
  const offerId = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active.id;
  await visit(`${CRED}/offers/${offerId}/key-facts?option=loan`, 'laf key facts', { shot: 'm5-16-laf-key-facts' });
  await page.click('input[type=checkbox]');
  await clickText('Accept', 'button');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.type('input[autocomplete=one-time-code]', '654321');
  await clickText('Confirm and sign', 'button');
  await until(() => page.evaluate(() => location.pathname.startsWith('/loans/')), 'laf schedule', 20000);
  await scenario('market_fall', 'sneha');
  await visit(`${CRED}/alerts`, 'market fall alerts', { shot: 'm5-17-alerts-market-fall' });
  // Above the safe share: selling is the way
  const big = Math.floor((fund.valuePaise * 0.9) / 100 / 100);
  await visit(`${CRED}/wealth/holdings/${holdings.find((h) => h.kind === 'mutual_fund' && h.id !== fund.id).id}/sell`, 'start selling 2');
  await page.type('input[inputmode=numeric]', String(Math.min(big, 250000)));
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('See what it costs', 'button')]);
  await waitText('Sell it');
  await settle();
  await check('sell only', { shot: 'm5-18-sell-only' });
  log('wealth-backed liquidity: sell vs borrow → loan against fund → market-fall alerts');
}

// Salary-Verified Credit and Wealth Management: Aarav links through the Account Aggregator
{
  await reset();
  await signIn('aarav');
  await visit(`${CRED}/credit/salary`, 'salary');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Continue to Account Aggregator', 'button')]);
  await waitText('Choose what to share');
  await settle();
  await check('aa consent', { shot: 'm5-30-aa-consent' });
  await page.click('input[type=checkbox]');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Approve', 'button')]);
  await until(() => page.evaluate(() => location.pathname === '/credit/salary'), 'back from AA', 20000);
  await waitText('Salary verified', 20000);
  await settle();
  await check('salary verified', { shot: 'm5-31-salary-verified' });
  await visit(`${CRED}/credit`, 'credit after salary', { shot: 'm5-32-credit-salary' });

  await visit(`${CRED}/wealth/link`, 'link wealth', { shot: 'm5-33-wealth-link' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Continue to Account Aggregator', 'button')]);
  await waitText('Choose what to share');
  for (const box of await page.$$('input[type=checkbox]')) await box.click();
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Approve', 'button')]);
  await until(() => page.evaluate(() => location.pathname === '/wealth'), 'back to wealth', 20000);
  await visit(`${CRED}/wealth/gold`, 'add gold', { shot: 'm5-34-gold' });
  await page.type('input[inputmode=decimal]', '10');
  await page.type('input[inputmode=numeric]', '60000');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Add gold', 'button')]);
  await visit(`${CRED}/wealth/goals/new`, 'new goal');
  const inputs = await page.$$('main input');
  await inputs[0].type('Sabbatical');
  await inputs[1].type('600000');
  await inputs[3].click({ clickCount: 3 });
  await inputs[3].type('100000');
  await clickText('Plan this goal', 'button');
  await waitText('Your plan', 20000);
  await settle();
  await check('goal plan', { shot: 'm5-35-goal-plan' });
  await visit(`${CRED}/wealth`, 'wealth linked', { shot: 'm5-36-wealth-linked' });
  log('salary verified and portfolio linked through the Account Aggregator; gold and a goal added');
}

// Family Health Insurance: Priya adds her parents and compares two ways from the insurer
{
  await reset();
  const token = await signIn('priya');
  for (const p of [
    { name: 'Gopal Menon', relation: 'parent', age: 68 },
    { name: 'Lakshmi Menon', relation: 'parent', age: 64 },
  ]) {
    await http(`${CRED_API}/v1/insurance/family`, { method: 'POST', headers: asMember(token), body: p });
  }
  await visit(`${CRED}/protect/family`, 'family');
  await clickText('Gopal Menon', 'label');
  await clickText('Lakshmi Menon', 'label');
  await clickText('₹5 lakh', 'label');
  await clickText('Compare from the insurer', 'button');
  await waitText('Waiting periods', 20000);
  await settle();
  await check('floater comparison', { shot: 'm5-22-floater-compare' });
  const offerId = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active.id;
  await visit(`${CRED}/offers/${offerId}/key-facts?option=policy_alt`, 'insurance key facts', { shot: 'm5-23-insurance-key-facts' });
  await page.click('input[type=checkbox]');
  await clickText('Accept', 'button');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.type('input[autocomplete=one-time-code]', '654321');
  await clickText('Confirm and pay premium', 'button');
  await until(() => page.evaluate(() => location.pathname === '/protect'), 'protect after purchase', 20000);
  await drain();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  await check('policy issued', { shot: 'm5-24-policy-issued' });
  log('family floater: compare → key facts with waiting periods → policy issued');
}

// Protection gap: insurer renewal, then (fresh world) a new car with third-party cover only
{
  await reset();
  const token = await signIn('priya');
  await scenario('insurer_renewal', 'priya');
  await visit(`${CRED}/protect`, 'gap after renewal', { shot: 'm5-27-gap-renewal' });
  const offerId = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active.id;
  await visit(`${CRED}/offers/${offerId}`, 'gap compare', { shot: 'm5-28-gap-topup' });
  await reset();
  const t2 = await signIn('priya');
  await scenario('new_vehicle', 'priya', 'third_party');
  await until(async () => (await http(`${CRED_API}/v1/offers`, { headers: asMember(t2) })).active, 'motor offer');
  await visit(`${CRED}/`, 'home motor offer', { shot: 'm5-29-home-motor-gap' });
  log('protection gap: renewal → top-up; new car → own-damage cover');
}

// Claims concierge
{
  await reset();
  await signIn('priya');
  await visit(`${CRED}/protect/claims/new`, 'new claim');
  await clickText('Sahaj Family Floater', 'label');
  const inputs = await page.$$('main input');
  await inputs.at(-2).type('45000');
  await inputs.at(-1).type('Diya: two nights at Seaview Hospital, fever');
  await settle();
  await check('new claim', { shot: 'm5-37-claim-new' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('File with the insurer', 'button')]);
  await scenario('claim_update', 'priya');
  await scenario('claim_update', 'priya');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  await check('claim timeline', { shot: 'm5-38-claim-timeline' });
  log('claims: filed → insurer updates by webhook');
}

// Rohan: a part payment brings help, not a switch
{
  await reset();
  const token = await signIn('rohan');
  const { cards } = await http(`${CRED_API}/v1/cards`, { headers: asMember(token) });
  await http(`${CRED_API}/v1/cards/${cards[0].id}/bill-payments`, { method: 'POST', headers: asMember(token), body: { kind: 'custom', amountPaise: 5_000_00, source: 'upi' } });
  await page.goto(CRED, { waitUntil: 'domcontentloaded' });
  await waitText('Here to help', 20000);
  await settle();
  await check('rohan help after part payment', { shot: 'm5-39-home-help-switch' });
  await visit(`${CRED}/profile/data`, 'rohan decisions', { shot: 'm5-41-decisions' });
  log('rohan: help instead of a balance switch');
}

// ── M6 flows ────────────────────────────────────────────────────────────────

/** Desktop console: wider viewport, same checks. Signs in as the demo staff member first. */
let consoleSignedIn = false;
async function adminVisit(url, label, shot) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  if (!consoleSignedIn && url.startsWith(ADMIN)) {
    staffToken ??= (await http(`${CRED_API}/admin/v1/login`, { method: 'POST', body: STAFF })).token;
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('cred_console_token', t), staffToken);
    consoleSignedIn = true;
  }
  pageErrors = [];
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.body.innerText.includes('Loading…') && !!document.querySelector('main')), `${label} loaded`, 20000);
  await new Promise((r) => setTimeout(r, 700));
  const text = await page.evaluate(() => document.body.innerText);
  if (/unreachable|Failed to fetch/.test(text)) failures.push(`${label}: console shows an error`);
  for (const e of pageErrors) failures.push(`${label}: page error: ${e}`);
  pageErrors = [];
  await axe(label);
  if (shot) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: 1440, height: Math.min(Math.max(900, h), 4000), deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: path.join(OUT, `${shot}.png`) });
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
}

// Early repayment: Aarav's laptop EMI, part repaid
{
  await reset();
  const token = await signIn('aarav');
  await buy('aarav', 1_50_000_00, 'Aero 14 Laptop');
  await until(async () => (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active, 'offer');
  await http(`${CRED_API}/v1/permissions`, { method: 'POST', headers: asMember(token), body: { scope: 'smart_savings', context: 'demo', explicit: true } });
  const offer = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active;
  const acc = await http(`${CRED_API}/v1/offers/${offer.id}/accept`, { method: 'POST', headers: asMember(token), body: { option: 'emi', keyFactsAcknowledged: true } });
  await http(`${CRED_API}/v1/offers/${offer.id}/confirm`, { method: 'POST', headers: asMember(token), body: { otp: acc.otp.demoOtp } });
  await drain();
  const loan = (await http(`${CRED_API}/v1/loans`, { headers: asMember(token) })).loans[0];
  await visit(`${CRED}/loans/${loan.id}/repay`, 'repay');
  await clickText('Part of it', 'label');
  await page.waitForSelector('input[inputmode=numeric]');
  await page.type('input[inputmode=numeric]', '50000');
  await waitText('less interest');
  await settle();
  await check('repay quote', { shot: 'm6-05-repay-quote' });
  await clickText('from my bank', 'button');
  await until(() => page.evaluate(() => !location.pathname.endsWith('/repay')), 'back to loan', 20000);
  await drain();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  await check('loan after repay', { shot: 'm6-06-loan-after-repay' });
  log('early repayment: quote → pay → lender confirms, interest saved shown');
}

// Car cover check: Aarav (policies not linked) buys a car; CRED asks; he says third-party only
{
  await reset();
  await signIn('aarav');
  await scenario('new_vehicle', 'aarav', 'third_party');
  await visit(`${CRED}/alerts`, 'car alert', { shot: 'm6-07-alert-car-check' });
  await visit(`${CRED}/protect/vehicle`, 'vehicle form');
  const inputs = await page.$$('main input:not([type=radio])');
  await inputs[0].type('Velocity Aura 1.2');
  await inputs[1].type('KA 01 AB 1234');
  await inputs[2].type('920000');
  await clickText('Third-party only', 'label');
  await settle();
  await check('vehicle form', { shot: 'm6-08-car-cover-form' });
  await clickText('Check my cover', 'button');
  await waitText('There’s a gap', 20000);
  await settle();
  await check('car gap', { shot: 'm6-09-car-cover-gap' });
  log('car cover check: asked, not assumed');
}

// Wellness reward applied at renewal (Priya's floater renews on 25 Nov)
{
  await reset();
  await signIn('priya');
  await advance();
  await visit(`${CRED}/protect/wellness`, 'wellness saved', { shot: 'm6-10-wellness-saved' });
  log('wellness: saving applied at renewal');
}

// Complaint → admin resolves → member sees the reply
{
  await reset();
  await signIn('kabir');
  await visit(`${CRED}/help`, 'help');
  await clickText('A suggestion or offer', 'label');
  await page.type('main input:not([type=radio])', 'I didn’t understand why I was offered an EMI after paying part of my bill.');
  await clickText('Send', 'button');
  await waitText('With our team');
  await settle();
  await check('complaint raised', { shot: 'm6-11-complaint-raised' });
  await adminVisit(`${ADMIN}/complaints`, 'admin complaints', 'm6-30-admin-complaints');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.type('textarea', 'Paying part of a bill leaves a balance that carries at 3.5% a month; the switch costs less. It’s only shown with Smart Savings on, and you can say no thanks.');
  await clickText('Resolve', 'button');
  await waitText('Reply:');
  await signIn('kabir');
  await visit(`${CRED}/help`, 'complaint answered', { shot: 'm6-12-complaint-answered' });
  log('complaints: raised → resolved → reply shown');
}

// Delete my data (Sneha, with a loan against her fund: retained)
{
  await reset();
  const token = await signIn('sneha');
  const { holdings } = await http(`${CRED_API}/v1/wealth/holdings`, { headers: asMember(token) });
  const fund = holdings.find((h) => h.name.startsWith('Meridian Flexi'));
  const r = await http(`${CRED_API}/v1/wealth/sell-intents`, { method: 'POST', headers: asMember(token), body: { holdingId: fund.id, amountNeededPaise: 2_00_000_00, months: 12 } });
  const acc = await http(`${CRED_API}/v1/offers/${r.offerId}/accept`, { method: 'POST', headers: asMember(token), body: { option: 'loan', keyFactsAcknowledged: true } });
  await http(`${CRED_API}/v1/offers/${r.offerId}/confirm`, { method: 'POST', headers: asMember(token), body: { otp: acc.otp.demoOtp } });
  await drain();
  await visit(`${CRED}/profile/privacy/delete`, 'delete');
  await page.type('main input', 'delete');
  await clickText('Delete my data', 'button');
  await waitText('Your data is deleted', 20000);
  await settle();
  await check('deleted', { shot: 'm6-13-deleted-retained' });
  log('delete my data: deleted, loan retained and explained');
}

// Admin console: a busy world first
{
  await reset();
  const t = await login('aarav');
  await buy('aarav', 1_50_000_00, 'Aero 14 Laptop');
  await until(async () => (await http(`${CRED_API}/v1/offers`, { headers: asMember(t) })).active, 'offer');
  await http(`${CRED_API}/v1/permissions`, { method: 'POST', headers: asMember(t), body: { scope: 'smart_savings', context: 'demo', explicit: true } });
  const o = (await http(`${CRED_API}/v1/offers`, { headers: asMember(t) })).active;
  const acc = await http(`${CRED_API}/v1/offers/${o.id}/accept`, { method: 'POST', headers: asMember(t), body: { option: 'emi', keyFactsAcknowledged: true } });
  await http(`${CRED_API}/v1/offers/${o.id}/confirm`, { method: 'POST', headers: asMember(t), body: { otp: acc.otp.demoOtp } });
  await buy('rohan', 1_50_000_00, 'Aero 14 Laptop');
  await http(`${CRED_API}/sim/member-actions`, { method: 'POST', body: { action: 'partial_bill_payment', personaKey: 'kabir' } });
  await scenario('insurer_renewal', 'priya');
  await http(`${CRED_API}/sim/member-actions`, { method: 'POST', body: { action: 'fund_sale', personaKey: 'sneha' } });
  await advance();
  const kt = await login('kabir');
  await http(`${CRED_API}/v1/complaints`, { method: 'POST', headers: asMember(kt), body: { category: 'offer', message: 'Why was I offered an EMI after paying part of my bill?' } });
  await drain();
  await adminVisit(`${ADMIN}/`, 'admin overview', 'm6-20-admin-overview');
  await adminVisit(`${ADMIN}/members`, 'admin members', 'm6-21-admin-members');
  const { members } = await http(`${CRED_API}/admin/v1/members`);
  await adminVisit(`${ADMIN}/members?id=${members.find((m) => m.personaKey === 'aarav').id}`, 'admin member detail', 'm6-22-admin-member-detail');
  await adminVisit(`${ADMIN}/transactions`, 'admin transactions', 'm6-23-admin-transactions');
  await adminVisit(`${ADMIN}/decisions`, 'admin decisions', 'm6-24-admin-decisions');
  await adminVisit(`${ADMIN}/audit`, 'admin audit', 'm6-25-admin-audit');
  await adminVisit(`${ADMIN}/partners`, 'admin partners', 'm6-26-admin-partners');
  await adminVisit(`${ADMIN}/rules`, 'admin rules', 'm6-27-admin-rules');
  // Edit a rule: an invalid value is refused with the reason, a valid one saved and logged
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await clickText('Edit', 'button');
  const edit = await page.$$('main input');
  const clear = async (el) => {
    await el.click();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
  };
  await clear(edit[0]);
  await edit[0].type('9');
  await edit[1].type('Testing the range check');
  await clickText('Save', 'button');
  await waitText('must be between');
  await page.screenshot({ path: path.join(OUT, 'm6-28-admin-rule-invalid.png') });
  await clear(edit[0]);
  await edit[0].type('3');
  await clickText('Save', 'button');
  await waitText('changed');
  await adminVisit(`${ADMIN}/audit`, 'admin audit after rule', undefined);
  await adminVisit(`${ADMIN}/demo`, 'control room', 'm6-29-control-room');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await clickText('Priya', 'label');
  await clickText('New car, third-party only', 'button');
  await until(() => page.evaluate(() => document.body.innerText.includes('New car, third-party only (priya):')), 'scenario fired', 20000);
  await page.screenshot({ path: path.join(OUT, 'm6-31-control-room-fired.png') });
  await http(`${CRED_API}/admin/v1/rules/reset`, { method: 'POST', body: { reason: 'screenshots' } });
  log('admin console and control room: every page renders, rule edit validated, scenario fired');
}

// ── M7 ──────────────────────────────────────────────────────────────────────

/** Desktop page outside the phone frame (ShopKart, ecosystem portals). */
async function deskVisit(url, label, shot, { navigate = true } = {}) {
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  pageErrors = [];
  if (navigate) await page.goto(url, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.body.innerText.includes('Loading…')), `${label} loaded`, 20000);
  await new Promise((r) => setTimeout(r, 600));
  const text = await page.evaluate(() => document.body.innerText);
  if (/Could not load|Something went wrong/.test(text)) failures.push(`${label}: shows an error`);
  for (const e of pageErrors) failures.push(`${label}: page error: ${e}`);
  pageErrors = [];
  await axe(label);
  if (shot) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: 1280, height: Math.min(Math.max(860, h), 3600), deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: path.join(OUT, `${shot}.png`) });
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
}
const SHOP = 'http://localhost:3002';
const ECO = 'http://localhost:3003';

// Repayment plan: Rohan's help card → plan → confirmed → tracked in Loans; no new credit after
{
  await reset();
  const token = await signIn('rohan');
  await buy('rohan', 1_50_000_00, 'Aero 14 Laptop');
  await page.goto(CRED, { waitUntil: 'domcontentloaded' });
  await waitText('See a plan', 20000);
  await settle();
  await check('help card with plan', { shot: 'm7-01-help-card-plan' });
  await clickText('See a plan', 'a');
  await waitText('Over how long?');
  await clickText('a month for 6 months', 'label');
  await page.click('input[type=checkbox]');
  await settle();
  await check('plan options', { shot: 'm7-02-plan-options' });
  await clickText('Set up this plan', 'button');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.type('input[autocomplete=one-time-code]', '123456');
  await clickText('Confirm my plan', 'button');
  await until(() => page.evaluate(() => location.pathname.startsWith('/loans/')), 'plan in loans', 20000);
  await drain();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  await check('plan schedule', { shot: 'm7-03-plan-in-loans' });
  await buy('rohan', 38_500_00, 'Studio 27 4K Monitor');
  await drain();
  await visit(`${CRED}/profile/data`, 'rohan decisions on plan', { shot: 'm7-04-no-credit-on-plan' });
  void token;
  log('repayment plan: chosen, confirmed by the partner, tracked; no new credit while on it');
}

// EMI bounce: Aarav's laptop EMI, then a cash crunch
{
  await reset();
  const token = await signIn('aarav');
  await buy('aarav', 1_50_000_00, 'Aero 14 Laptop');
  await until(async () => (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active, 'offer');
  await http(`${CRED_API}/v1/permissions`, { method: 'POST', headers: asMember(token), body: { scope: 'smart_savings', context: 'demo', explicit: true } });
  const o = (await http(`${CRED_API}/v1/offers`, { headers: asMember(token) })).active;
  const acc = await http(`${CRED_API}/v1/offers/${o.id}/accept`, { method: 'POST', headers: asMember(token), body: { option: 'emi', keyFactsAcknowledged: true } });
  await http(`${CRED_API}/v1/offers/${o.id}/confirm`, { method: 'POST', headers: asMember(token), body: { otp: acc.otp.demoOtp } });
  await drain();
  await scenario('cash_crunch', 'aarav');
  await advance();
  await visit(`${CRED}/alerts`, 'bounce alert', { shot: 'm7-05-bounce-alert' });
  const loan = (await http(`${CRED_API}/v1/loans`, { headers: asMember(token) })).loans[0];
  await visit(`${CRED}/loans/${loan.id}`, 'bounce loan');
  await clickText('Pay now', 'button');
  await waitText('doesn’t have');
  await settle();
  await check('bounce pay now', { shot: 'm7-06-bounce-options' });
  await adminVisit(`${ADMIN}/`, 'admin overview with bounce', 'm7-07-admin-defaults');
  log('EMI bounce: calm notice with options; admin defaults reflect it');
}

// Console sign-in
{
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('cred_console_token'));
  consoleSignedIn = false;
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await deskVisit(`${ADMIN}/login`, 'console login', 'm7-08-console-login', { navigate: false });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.type('input[type=email]', STAFF.email);
  await page.type('input[type=password]', STAFF.password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Sign in', 'button')]);
  await waitText('Signed in as Ananya Rao', 20000);
  consoleSignedIn = true;
  log('console: staff sign-in');
}

// ShopKart: catalogue → product → cart → checkout (card, then UPI) → order confirmation
{
  await reset();
  await deskVisit(`${SHOP}/`, 'shop home');
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.select('#persona', 'aarav');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Switch', 'button')]);
  await deskVisit(`${SHOP}/`, 'shop home as aarav', 'm7-10-shop-home', { navigate: false });
  await deskVisit(`${SHOP}/product/studio-27`, 'shop product', 'm7-11-shop-product');
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Add to cart', 'button')]);
  await deskVisit(`${SHOP}/cart`, 'shop cart', 'm7-12-shop-cart', { navigate: false });
  await deskVisit(`${SHOP}/checkout`, 'shop checkout');
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await clickText('Credit or debit card', 'label');
  await page.waitForSelector('input[name=cardToken]');
  await page.click('input[name=cardToken]');
  await deskVisit(`${SHOP}/checkout`, 'shop checkout card', 'm7-13-shop-checkout', { navigate: false });
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Pay ₹', 'button')]);
  await page.waitForSelector('input[inputmode=numeric]');
  await deskVisit(page.url(), 'bank otp page', 'm7-14-bank-otp', { navigate: false });
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.type('input[inputmode=numeric]', '123456');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Confirm payment', 'button')]);
  await waitText('your order is placed', 20000);
  await deskVisit(page.url(), 'order placed', 'm7-15-shop-order', { navigate: false });
  // UPI checkout of a small item
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.goto(`${SHOP}/product/usb-c-cable`, { waitUntil: 'domcontentloaded' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Buy now', 'button')]);
  await clickText('UPI', 'label');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Pay ₹', 'button')]);
  await page.waitForSelector('input[type=password]');
  await deskVisit(page.url(), 'upi pin for shop', 'm7-16-shop-upi-pin', { navigate: false });
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.type('input[type=password]', '1234');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickText('Pay', 'button[type=submit]')]);
  await waitText('your order is placed', 20000);
  log('ShopKart: catalogue, product, cart, card checkout with bank OTP, UPI checkout with PIN, orders');
}

// Ecosystem portals, each in its own brand
{
  await reset();
  await deskVisit(`${ECO}/`, 'ecosystem directory', 'm7-20-ecosystem-directory');
  await deskVisit(`${ECO}/bank?c=per_sneha`, 'bank portal', 'm7-21-bank-portal');
  await deskVisit(`${ECO}/upi?c=per_priya`, 'upi portal', 'm7-22-upi-portal');
  await deskVisit(`${ECO}/aa?c=per_sneha`, 'aa portal', 'm7-23-aa-portal');
  await deskVisit(`${ECO}/insurer?c=per_priya`, 'insurer portal', 'm7-24-insurer-portal');
  await deskVisit(`${ECO}/fundhouse?c=per_sneha`, 'fund house portal', 'm7-25-fundhouse-portal');
  await http(`${CRED_API}/sim/member-actions`, { method: 'POST', body: { action: 'fund_sale', personaKey: 'sneha' } });
  const t = await login('sneha');
  const off = (await http(`${CRED_API}/v1/offers`, { headers: asMember(t) })).active;
  const acc = await http(`${CRED_API}/v1/offers/${off.id}/accept`, { method: 'POST', headers: asMember(t), body: { option: 'loan', keyFactsAcknowledged: true } });
  await http(`${CRED_API}/v1/offers/${off.id}/confirm`, { method: 'POST', headers: asMember(t), body: { otp: acc.otp.demoOtp } });
  await drain();
  await deskVisit(`${ECO}/lender?c=per_sneha`, 'lender portal', 'm7-26-lender-portal');
  await deskVisit(`${ECO}/health?c=per_priya`, 'health app', 'm7-27-health-app');
  log('ecosystem: bank, UPI, AA, insurer, fund house, lender and health app portals');
}

await browser.close();
await reset(); // leave a clean demo world

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nAll screens passed for ${PERSONAS.length} personas. Screenshots in docs/screenshots/${milestone}/`);
