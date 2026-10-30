import path from 'node:path';

const pkgRoot = path.resolve(import.meta.dirname, '..');

/** SQLite file URLs. Override with CRED_DATABASE_URL / ECOSYSTEM_DATABASE_URL (the e2e test does). */
export const databaseUrl = {
  cred: () => process.env.CRED_DATABASE_URL ?? 'file:' + path.join(pkgRoot, 'data/cred.db'),
  ecosystem: () => process.env.ECOSYSTEM_DATABASE_URL ?? 'file:' + path.join(pkgRoot, 'data/ecosystem.db'),
};
