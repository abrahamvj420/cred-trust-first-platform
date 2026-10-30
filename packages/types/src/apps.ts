import { z } from 'zod';
import { ServiceName, ServiceStatus } from './common';
import { endpoint } from './contract';

/** Route handlers served by the Next.js apps themselves. */
export const ServiceProbe = z.object({
  service: ServiceName,
  url: z.url(),
  status: ServiceStatus.nullable(),
  error: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
});
export type ServiceProbe = z.infer<typeof ServiceProbe>;

export const appEndpoints = {
  status: endpoint({
    method: 'GET',
    path: '/status',
    auth: 'none',
    summary: 'App health (every Next.js app)',
    response: ServiceStatus,
  }),
  demoStatus: endpoint({
    method: 'GET',
    path: '/api/demo/status',
    auth: 'demo',
    summary: 'Admin control room: probe every app and API (DEMO_MODE only)',
    response: z.object({ probes: z.array(ServiceProbe), checkedAt: z.iso.datetime({ offset: true }) }),
  }),
} as const;
