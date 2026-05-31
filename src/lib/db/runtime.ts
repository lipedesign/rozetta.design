import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const DEFAULT_ORGANIZATION_ID = "local-org";
export const DEFAULT_WORKSPACE_ID = "local";
export const DEFAULT_ORGANIZATION_SLUG = "local";
export const DEFAULT_WORKSPACE_SLUG = "workspace";

type PostgresDb = ReturnType<typeof drizzlePostgres<typeof schema>>;
type PgliteDb = ReturnType<typeof drizzlePglite<typeof schema>>;
type RozettaDb = PostgresDb | PgliteDb;

let db: RozettaDb | undefined;
let postgresClient: postgres.Sql | undefined;
let pgliteClient: PGlite | undefined;

export function getDb(): RozettaDb {
  if (db) return db;

  if (shouldUsePglite()) {
    pgliteClient = new PGlite(process.env.ROZETTA_PGLITE_DATA_DIR);
    db = drizzlePglite(pgliteClient, { schema });
    return db;
  }

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL or SUPABASE_DB_PASSWORD is required. Link Supabase and add database credentials to .env.local."
    );
  }

  postgresClient = postgres(connectionString, {
    max: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 1),
    prepare: false,
  });
  db = drizzlePostgres(postgresClient, { schema });
  return db;
}

export async function closeDb() {
  await postgresClient?.end({ timeout: 1 });
  await pgliteClient?.close();
  postgresClient = undefined;
  pgliteClient = undefined;
  db = undefined;
}

export const closeDbForTests = closeDb;

export function isUsingPglite() {
  return shouldUsePglite();
}

function shouldUsePglite() {
  return process.env.ROZETTA_DB_DRIVER === "pglite";
}

function getDatabaseUrl() {
  if (isUsableDatabaseUrl(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL;
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return undefined;

  const host = process.env.SUPABASE_DB_HOST ?? "aws-1-us-west-2.pooler.supabase.com";
  const port = process.env.SUPABASE_DB_PORT ?? "5432";
  const database = process.env.SUPABASE_DB_NAME ?? "postgres";
  const user = process.env.SUPABASE_DB_USER ?? "postgres.your-project-ref";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function isUsableDatabaseUrl(value: string | undefined) {
  return Boolean(
    value &&
      !value.includes("[YOUR-PASSWORD]") &&
      !value.includes("your-database-password") &&
      !value.includes("[YOUR-HOST]")
  );
}
