import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/cred/client';
import { databaseUrl } from './paths';

export * from './generated/cred/client';

/** cred.db client. Only cred-api (and the seeder) may import this. */
export function createCredDb(url: string = databaseUrl.cred()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export type CredDb = PrismaClient;
