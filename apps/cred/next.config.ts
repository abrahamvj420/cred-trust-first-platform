import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root for every app and service
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Keeps screenshots and demos clean; errors still show in the overlay.
  devIndicators: false,
  transpilePackages: ['@cred/types', '@cred/ui'],
  env: {
    NEXT_PUBLIC_CRED_API_URL: process.env.CRED_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_ECOSYSTEM_API_URL: process.env.ECOSYSTEM_API_URL ?? 'http://localhost:4100',
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? 'false',
  },
};

export default config;
