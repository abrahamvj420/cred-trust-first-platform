import type { ServiceName } from './common';

/** Fixed local ports. Keep README in sync. */
export const PORTS: Record<ServiceName, number> = {
  cred: 3000,
  admin: 3001,
  shop: 3002,
  ecosystem: 3003,
  'cred-api': 4000,
  'ecosystem-api': 4100,
};

export const localUrl = (service: ServiceName) => `http://localhost:${PORTS[service]}`;
