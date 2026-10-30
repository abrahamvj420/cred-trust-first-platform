import { appEndpoints, localUrl, ServiceStatus, type ServiceName, type ServiceProbe } from '@cred/types';

/**
 * Contract: appEndpoints.demoStatus. The control-room exception (CLAUDE.md):
 * admin may call every service's /status directly, only when DEMO_MODE=true.
 */
const SERVICES: ServiceName[] = ['cred', 'admin', 'shop', 'ecosystem', 'cred-api', 'ecosystem-api'];

async function probe(service: ServiceName): Promise<ServiceProbe> {
  const url = `${localUrl(service)}/status`;
  const started = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
    const status = ServiceStatus.parse(await res.json());
    return { service, url, status, error: null, latencyMs: Date.now() - started };
  } catch (e) {
    return { service, url, status: null, error: e instanceof Error ? e.message : 'unreachable', latencyMs: null };
  }
}

export async function GET() {
  if (process.env.DEMO_MODE !== 'true') {
    return Response.json({ error: { code: 'demo_mode_off', message: 'Control room needs DEMO_MODE=true' } }, { status: 403 });
  }
  const body = appEndpoints.demoStatus.response.parse({
    probes: await Promise.all(SERVICES.map(probe)),
    checkedAt: new Date().toISOString(),
  });
  return Response.json(body);
}

export const dynamic = 'force-dynamic';
