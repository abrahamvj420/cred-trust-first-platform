import { createCredDb } from '../cred';
import { createEcosystemDb } from '../ecosystem';
import { buildWorlds } from './index';
import { seedCred } from './cred';
import { seedEcosystem } from './ecosystem';
import { formatInr } from '@cred/types';

const worlds = buildWorlds();
const eco = createEcosystemDb();
const cred = createCredDb();
try {
  await seedEcosystem(eco, worlds);
  await seedCred(cred, worlds);
  console.log('Seeded ecosystem.db and cred.db with demo personas:');
  for (const w of worlds) {
    const util = Math.round((w.outstandingPaise / w.fixture.card.limitPaise) * 100);
    const open = w.statements.at(-1)!;
    console.log(
      `  ${w.persona.name.padEnd(13)} card ${formatInr(w.fixture.card.limitPaise).padStart(9)} limit · ${String(util).padStart(2)}% used · bill ${formatInr(open.totalDuePaise)} due ${open.dueDate} · on-time streak ${w.onTimeStreak}`,
    );
  }
} finally {
  await eco.$disconnect();
  await cred.$disconnect();
}
