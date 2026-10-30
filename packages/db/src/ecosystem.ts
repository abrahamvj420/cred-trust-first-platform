import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/ecosystem/client';
import { databaseUrl } from './paths';

export * from './generated/ecosystem/client';

/** ecosystem.db client. Only ecosystem-api (and the seeder) may import this. CRED never does. */
export function createEcosystemDb(url: string = databaseUrl.ecosystem()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export type EcosystemDb = PrismaClient;
