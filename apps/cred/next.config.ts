import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root for every app and service
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Keeps screenshots and demos clean; errors still show in the overlay.
  devIndicators: false,
  // The side-by-side page (pnpm side-by-side) loads the second phone from 127.0.0.1
  allowedDevOrigins: ['127.0.0.1'],
  // A separate build folder lets a production build run beside `pnpm dev` (which uses .next)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@cred/types', '@cred/ui'],
  env: {
    NEXT_PUBLIC_CRED_API_URL: process.env.CRED_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_ECOSYSTEM_API_URL: process.env.ECOSYSTEM_API_URL ?? 'http://localhost:4100',
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? 'false',
  },
};

export default config;
