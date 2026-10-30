import { createCredDb, type CredDb } from '../cred';
import { createEcosystemDb, type EcosystemDb } from '../ecosystem';
import { seedCred } from './cred';
import { seedEcosystem } from './ecosystem';
import { PERSONA_FIXTURES } from './personas';
import { buildPersonaWorld } from './world';

export { PERSONA_FIXTURES } from './personas';
export { buildPersonaWorld, type PersonaWorld } from './world';
export { summariseActivityWeek } from './wearable';
export { DEMO_UPI_PIN } from './ecosystem';
export * as catalog from './catalog';

export const buildWorlds = () => PERSONA_FIXTURES.map(buildPersonaWorld);

/** Reset cred.db only (cred-api's /sim/reset). */
export async function resetCred(db: CredDb = createCredDb()): Promise<void> {
  await seedCred(db, buildWorlds());
}

/** Reset ecosystem.db only (ecosystem-api's /sim/v1/reset). */
export async function resetEcosystem(db: EcosystemDb = createEcosystemDb()): Promise<void> {
  await seedEcosystem(db, buildWorlds());
}
