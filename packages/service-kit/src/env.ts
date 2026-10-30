import { existsSync } from 'node:fs';
import path from 'node:path';

/** Loads the repo-root .env once (services run from their own folders). */
export function loadRootEnv(): void {
  const file = path.resolve(import.meta.dirname, '../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export const isDemoMode = () => process.env.DEMO_MODE === 'true';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. Copy .env.example to .env.`);
  return v;
}
