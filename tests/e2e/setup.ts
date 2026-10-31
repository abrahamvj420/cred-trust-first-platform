import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Starts real cred-api and ecosystem-api processes on spare ports with fresh
 * SQLite files, so the e2e run never touches dev data.
 */
const root = path.resolve(import.meta.dirname, '../..');
export const E2E = { credApi: 'http://127.0.0.1:4900', ecosystemApi: 'http://127.0.0.1:4910' };

let procs: ChildProcess[] = [];
let dir = '';

export async function setup(): Promise<void> {
  dir = mkdtempSync(path.join(tmpdir(), 'cred-e2e-'));
  const env = {
    ...process.env,
    DEMO_MODE: 'true',
    LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
    CRED_DATABASE_URL: `file:${dir}/cred.db`,
    ECOSYSTEM_DATABASE_URL: `file:${dir}/ecosystem.db`,
    CRED_API_URL: E2E.credApi,
    ECOSYSTEM_API_URL: E2E.ecosystemApi,
  };
  for (const name of ['cred', 'ecosystem']) {
    execSync(`pnpm exec prisma db push --config prisma.${name}.config.ts`, { cwd: path.join(root, 'packages/db'), env, stdio: 'pipe' });
  }
  procs = [
    spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], { cwd: path.join(root, 'services/cred-api'), env: { ...env, PORT: '4900' }, stdio: 'inherit' }),
    spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], { cwd: path.join(root, 'services/ecosystem-api'), env: { ...env, PORT: '4910' }, stdio: 'inherit' }),
  ];
  for (const url of Object.values(E2E)) {
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        if ((await fetch(`${url}/status`)).ok) break;
      } catch {}
      if (Date.now() > deadline) throw new Error(`${url} did not start`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

export async function teardown(): Promise<void> {
  for (const p of procs) p.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  if (dir) rmSync(dir, { recursive: true, force: true });
}
