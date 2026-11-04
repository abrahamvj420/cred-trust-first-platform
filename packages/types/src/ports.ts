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

/** Where each app and API lives when hosted; unset means local. */
export const URL_ENV: Record<ServiceName, string> = {
  cred: 'CRED_APP_URL',
  admin: 'ADMIN_APP_URL',
  shop: 'SHOP_APP_URL',
  ecosystem: 'ECOSYSTEM_APP_URL',
  'cred-api': 'CRED_API_URL',
  'ecosystem-api': 'ECOSYSTEM_API_URL',
};

/** The service's address: its environment variable when hosted, localhost otherwise. Server-side only. */
export function serviceUrl(service: ServiceName): string {
  const fromEnv = typeof process === 'undefined' ? undefined : process.env[URL_ENV[service]];
  return (fromEnv || localUrl(service)).replace(/\/$/, '');
}
