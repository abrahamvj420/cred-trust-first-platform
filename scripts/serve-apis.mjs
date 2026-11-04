/**
 * Hosting entry point for both APIs in one container (Render, Railway, Fly …).
 *
 *   node scripts/serve-apis.mjs
 *
 * 1. Creates the SQLite schemas and seeds the demo personas, so both worlds start
 *    (and restart) together and never drift apart.
 * 2. Starts cred-api and ecosystem-api on private ports.
 * 3. Serves both on one public port ($PORT): /eco/… goes to ecosystem-api (prefix
 *    removed), everything else to cred-api. So the apps use
 *      CRED_API_URL=https://<host>        ECOSYSTEM_API_URL=https://<host>/eco
 *    Streams (server-sent events) pass straight through.
 */
import { execSync, spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const PUBLIC_PORT = Number(process.env.PORT ?? 8080);
const CRED_PORT = Number(process.env.CRED_API_INTERNAL_PORT ?? 4000);
const ECO_PORT = Number(process.env.ECOSYSTEM_API_INTERNAL_PORT ?? 4100);

// The services talk to each other privately; the apps reach them through this router
const internal = {
  ...process.env,
  CRED_API_URL: `http://127.0.0.1:${CRED_PORT}`,
  ECOSYSTEM_API_URL: `http://127.0.0.1:${ECO_PORT}`,
  DEMO_MODE: process.env.DEMO_MODE ?? 'true',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
};

console.log('▸ Creating schemas and seeding demo data');
execSync('pnpm seed', { cwd: root, env: internal, stdio: 'inherit' });

const children = [
  ['cred-api', CRED_PORT],
  ['ecosystem-api', ECO_PORT],
].map(([name, port]) => {
  const child = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], { cwd: path.join(root, 'services', name), env: { ...internal, PORT: String(port) }, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`${name} exited (${code}); stopping so the host restarts both together`);
    process.exit(1);
  });
  return child;
});
const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

const server = http.createServer((req, res) => {
  const eco = req.url === '/eco' || req.url.startsWith('/eco/') || req.url.startsWith('/eco?');
  const target = eco ? ECO_PORT : CRED_PORT;
  const url = eco ? req.url.slice(4) || '/' : req.url;
  const upstream = http.request({ host: '127.0.0.1', port: target, method: req.method, path: url.startsWith('/') ? url : `/${url}`, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'starting', message: 'The demo is starting up. Try again in a few seconds.' } }));
  });
  req.pipe(upstream);
  res.on('close', () => upstream.destroy());
});
server.listen(PUBLIC_PORT, '0.0.0.0', () => console.log(`▸ APIs on :${PUBLIC_PORT} (cred-api at /, ecosystem-api at /eco)`));
