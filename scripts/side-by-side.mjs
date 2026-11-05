/**
 * Side by side: Aarav and Rohan on two phones, one screen, for the presentation.
 *
 *   pnpm demo            (in another terminal)
 *   pnpm side-by-side    → http://localhost:3005
 *
 * Each phone is the real CRED app (or ShopKart). The left phone loads it from
 * localhost and the right from 127.0.0.1, so the browser keeps two separate
 * sign-ins. The buttons do what the control room does (DEMO_MODE), through
 * this page's own server: the laptop goes through ShopKart's gateway and Mock
 * Bank, the bank tells CRED by webhook, and each phone updates live.
 */
import http from 'node:http';

const PORT = Number(process.env.SIDE_BY_SIDE_PORT ?? 3005);
const ECO_API = process.env.ECOSYSTEM_API_URL ?? 'http://localhost:4100';
const CRED_API = process.env.CRED_API_URL ?? 'http://localhost:4000';

const PHONES = [
  { key: 'aarav', name: 'Aarav Mehta', note: 'Pays in full · gets a saving', host: 'localhost' },
  { key: 'rohan', name: 'Rohan Das', note: 'Pays the minimum · gets help', host: '127.0.0.1' },
];

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `${res.status}`);
  return json;
}

const actions = {
  /** The ₹1.5L laptop at ShopKart, charged on the card through the gateway and Mock Bank. */
  buy: async ({ persona }) => (await post(`${ECO_API}/sim/v1/scenarios`, { scenario: 'big_purchase', personaKey: persona })).note,
  advance: async () => {
    const r = await post(`${ECO_API}/sim/v1/clock/advance`, { months: 1 });
    return `${r.from} → ${r.to}`;
  },
  reset: async () => {
    await post(`${ECO_API}/sim/v1/reset`);
    await post(`${CRED_API}/sim/reset`);
    return 'Both worlds reset to 2 Nov 2026. Each phone stays signed in.';
  },
};

const page = () => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Side by side · Aarav and Rohan</title>
<style>
  :root { --bg: #0b0b0c; --surface: #151517; --raised: #1d1d20; --border: #2a2a2e; --text: #f4f4f5; --muted: #a1a1aa; --accent: #e8d9b8; --accent-text: #141414; --ok: #4ade80; --bad: #f87171; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
  h1 { font-size: 16px; margin: 0; letter-spacing: .01em; }
  .muted { color: var(--muted); }
  button { font: inherit; font-weight: 600; min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--raised); color: var(--text); cursor: pointer; }
  button:hover { border-color: var(--muted); }
  button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: wait; }
  .global { display: flex; gap: 8px; flex-wrap: wrap; }
  main { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px 24px; min-height: 0; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 0; }
  .who { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; max-width: 560px; min-height: 52px; }
  .who > div:first-child { white-space: nowrap; }
  .who h2 { margin: 0; font-size: 18px; }
  .controls { display: flex; gap: 8px; flex-wrap: nowrap; justify-content: flex-end; }
  .tabs button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  .stage { flex: 1; min-height: 0; width: 100%; display: flex; justify-content: center; overflow: hidden; }
  .phone { width: 390px; height: 844px; border: 10px solid #000; border-radius: 44px; overflow: hidden; background: #000; box-shadow: 0 0 0 1px var(--border), 0 20px 60px rgba(0,0,0,.6); transform-origin: top center; }
  .phone iframe { width: 100%; height: 100%; border: 0; background: var(--bg); }
  #log { font-size: 12px; max-height: 3.2em; overflow: hidden; }
  #log .bad { color: var(--bad); } #log .ok { color: var(--ok); }
</style>
</head>
<body>
<header>
  <div>
    <h1>Side by side · same laptop, two members</h1>
    <div id="log" class="muted">First time: tap <b>Aarav Mehta</b> in the left phone and <b>Rohan Das</b> in the right. Each phone remembers its member.</div>
  </div>
  <div class="global">
    <button class="primary" data-action="both">Both buy the ₹1.5L laptop</button>
    <button data-action="advance">Advance a month</button>
    <button data-action="reset">Reset demo</button>
  </div>
</header>
<main>
${PHONES.map(
  (p) => `  <section class="col" data-persona="${p.key}" data-host="${p.host}">
    <div class="who">
      <div><h2>${p.name}</h2><div class="muted">${p.note}</div></div>
      <div class="controls">
        <button data-action="buy" data-persona="${p.key}">Buy the ₹1.5L laptop</button>
        <span class="tabs"><button data-view="cred" aria-pressed="true">CRED</button> <button data-view="shop" aria-pressed="false">ShopKart</button></span>
      </div>
    </div>
    <div class="stage"><div class="phone"><iframe title="${p.name}'s phone" src="http://${p.host}:3000/" allow="clipboard-write"></iframe></div></div>
  </section>`,
).join('\n')}
</main>
<script>
  const log = document.getElementById('log');
  const say = (text, cls = '') => { log.innerHTML = '<span class="' + cls + '">' + new Date().toLocaleTimeString('en-IN') + ' · ' + text + '</span>'; };

  // Fit both phones to the window height
  const fit = () => document.querySelectorAll('.phone').forEach((ph) => {
    const avail = ph.parentElement.clientHeight;
    const s = Math.min(1, avail / 864);
    ph.style.transform = 'scale(' + s + ')';
    ph.parentElement.style.height = '';
  });
  addEventListener('resize', fit); fit();

  // CRED app or ShopKart in each phone
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const col = b.closest('.col');
    const port = b.dataset.view === 'shop' ? 3002 : 3000;
    col.querySelector('iframe').src = 'http://' + col.dataset.host + ':' + port + '/';
    col.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  async function act(name, body) {
    const res = await fetch('/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'failed');
    return json.note;
  }
  document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', async () => {
    const all = document.querySelectorAll('[data-action]');
    all.forEach((x) => (x.disabled = true));
    try {
      const a = b.dataset.action;
      if (a === 'both') {
        await Promise.all([act('buy', { persona: 'aarav' }), act('buy', { persona: 'rohan' })]);
        say('Aarav and Rohan each bought the laptop. Watch both phones.', 'ok');
      } else if (a === 'buy') {
        await act('buy', { persona: b.dataset.persona });
        say((b.dataset.persona === 'aarav' ? 'Aarav' : 'Rohan') + ' bought the laptop: ShopKart → Mock Bank → CRED.', 'ok');
      } else if (a === 'reset') {
        say(await act('reset'), 'ok');
        document.querySelectorAll('iframe').forEach((f) => (f.src = f.src));
      } else {
        say('Clock: ' + (await act(a)), 'ok');
      }
    } catch (e) {
      say(e.message + ' (is pnpm demo running?)', 'bad');
    }
    all.forEach((x) => (x.disabled = false));
  }));
</script>
</body>
</html>`;

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page());
    }
    const name = req.method === 'POST' && req.url.startsWith('/api/') ? req.url.slice(5) : null;
    if (!name || !actions[name]) {
      res.writeHead(404);
      return res.end();
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const body = raw ? JSON.parse(raw) : {};
      if (name === 'buy' && !PHONES.some((p) => p.key === body.persona)) throw new Error('Unknown member');
      const note = await actions[name](body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ note }));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message ?? e) }));
    }
  })
  .listen(PORT, () => console.log(`Side by side: http://localhost:${PORT}  (needs pnpm demo running)`));
