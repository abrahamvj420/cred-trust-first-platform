interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
}

/** Deletes every row in every table, keeping the schema. Safe while services are running. */
export async function wipeAllTables(db: RawDb): Promise<void> {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
  );
  await db.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  try {
    for (const { name } of tables) await db.$executeRawUnsafe(`DELETE FROM "${name}"`);
  } finally {
    await db.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
}
