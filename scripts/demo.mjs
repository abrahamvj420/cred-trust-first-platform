/**
 * pnpm demo: the documented way to start a demo.
 *
 * 1. Clears the Next.js caches (stale dev builds can reload pages in a loop).
 * 2. Resets every database to the demo personas (pnpm seed).
 * 3. Starts every app and service with LOG_LEVEL=warn, writing output to
 *    logs/demo.log (a file, so no pipe can fill up and stall the services).
 * 4. Waits until all six report green on /status, then prints the URLs.
 * Ctrl-C stops everything.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SERVICES = [
  ['CRED app', 'http://localhost:3000'],
  ['Admin console', 'http://localhost:3001'],
  ['ShopKart', 'http://localhost:3002'],
  ['Ecosystem', 'http://localhost:3003'],
  ['cred-api', 'http://localhost:4000'],
  ['ecosystem-api', 'http://localhost:4100'],
];

const step = (s) => console.log(`\n▸ ${s}`);

step('Clearing Next.js caches');
for (const app of ['cred', 'admin', 'shop', 'ecosystem']) rmSync(path.join(root, 'apps', app, '.next'), { recursive: true, force: true });

step('Resetting demo data (pnpm seed)');
execSync('pnpm seed', { cwd: root, stdio: 'inherit' });

step('Starting apps and services (output in logs/demo.log)');
mkdirSync(path.join(root, 'logs'), { recursive: true });
const out = openSync(path.join(root, 'logs', 'demo.log'), 'w');
const dev = spawn('pnpm', ['dev'], { cwd: root, env: { ...process.env, LOG_LEVEL: 'warn', DEMO_MODE: process.env.DEMO_MODE ?? 'true' }, stdio: ['ignore', out, out], detached: true });
const stop = () => {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {}
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
dev.on('exit', (code) => {
  console.error(`\npnpm dev exited (${code}). See logs/demo.log.`);
  process.exit(code ?? 1);
});

step('Waiting for every service to report green');
const up = new Map();
const deadline = Date.now() + 240_000;
while (up.size < SERVICES.length) {
  for (const [name, url] of SERVICES) {
    if (up.has(name)) continue;
    try {
      const r = await fetch(`${url}/status`, { signal: AbortSignal.timeout(20_000) });
      const s = await r.json();
      if (r.ok && s.ok !== false) {
        up.set(name, s);
        console.log(`  ● ${name.padEnd(14)} green  ${url}`);
      }
    } catch {}
  }
  if (up.size < SERVICES.length) {
    if (Date.now() > deadline) {
      console.error(`\nStill waiting for: ${SERVICES.filter(([n]) => !up.has(n)).map(([n]) => n).join(', ')}. See logs/demo.log.`);
      stop();
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
// Warm the first pages so the first click in front of an audience is instant
await Promise.all(['http://localhost:3000/', 'http://localhost:3001/login', 'http://localhost:3002/', 'http://localhost:3003/'].map((u) => fetch(u).catch(() => null)));

console.log(`
✔ Demo ready (simulated date ${up.get('cred-api')?.simDate ?? '2026-11-02'}).

  CRED app        http://localhost:3000      (open in a phone-sized window)
  Admin console   http://localhost:3001      ops@cred.example / trust-first-demo
  Control room    http://localhost:3001/demo
  ShopKart        http://localhost:3002
  Ecosystem       http://localhost:3003

  Demo script: README → "Demo script". Ctrl-C stops everything.
`);
