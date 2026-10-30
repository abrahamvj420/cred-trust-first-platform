import { ServiceStatus } from '@cred/types';

const startedAt = Date.now();

/** Contract: appEndpoints.status in @cred/types */
export function GET() {
  return Response.json(
    ServiceStatus.parse({
      service: 'cred',
      ok: true,
      version: '0.1.0',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      demoMode: process.env.DEMO_MODE === 'true',
      db: 'none',
      simDate: null,
      time: new Date().toISOString(),
    }),
  );
}

export const dynamic = 'force-dynamic';
