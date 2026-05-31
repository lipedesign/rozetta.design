import "../../../env.config";

import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";

import { closeDb, getDb, isUsingPglite } from "./runtime";

export async function migrateRuntimeDatabase() {
  const db = getDb();
  const migrationsFolder = "drizzle";
  if (isUsingPglite()) {
    await migratePglite(db as Parameters<typeof migratePglite>[0], { migrationsFolder });
    return;
  }
  await migratePostgres(db as Parameters<typeof migratePostgres>[0], { migrationsFolder });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateRuntimeDatabase()
    .then(() => {
      console.log("Rozetta Supabase/Postgres database migrated.");
    })
    .then(() => closeDb())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
