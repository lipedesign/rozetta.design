import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { isUsingPglite } from "@/lib/db/runtime";
import type { SettingsRuntimeInfo, SettingsStorageStatus } from "./types";

/**
 * Pure server-only helpers used by `src/lib/settings/actions.ts`. They live in
 * a sibling file (not in `actions.ts`) because Next.js requires every export
 * from a `'use server'` module to be an async Server Action. Splitting these
 * out keeps the Server Action surface narrow and lets us export sync helpers
 * and a sync-friendly redactor.
 */

/**
 * Reads runtime DB configuration without touching the DB itself. Used by the
 * Settings → Storage panel to surface "configured / not configured" without
 * leaking the raw `DATABASE_URL`.
 */
export function readStorageStatus(): SettingsStorageStatus {
  const driver = isUsingPglite() ? "pglite" : "postgres";
  const databaseUrl = process.env.DATABASE_URL;
  const supabasePassword = process.env.SUPABASE_DB_PASSWORD;
  const usable =
    Boolean(
      databaseUrl &&
        !databaseUrl.includes("[YOUR-PASSWORD]") &&
        !databaseUrl.includes("your-database-password")
    ) || Boolean(supabasePassword);
  const databaseConfigured = driver === "pglite" || usable;
  const databaseLabel =
    driver === "pglite"
      ? "Local PGlite (in-process)"
      : usable
        ? redactDatabaseUrl(databaseUrl ?? "")
        : "Not configured";
  return {
    databaseConfigured,
    driver,
    artifactPath: "tokens/<collection-id>/<mode-id>.tokens.json",
    databaseLabel,
  };
}

export async function readRuntimeInfo(): Promise<SettingsRuntimeInfo> {
  let appVersion = "0.0.0";
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version) appVersion = parsed.version;
  } catch {
    // Reading package.json is best-effort; fall back to a safe default rather
    // than blowing up the entire settings page if the file isn't readable.
  }
  return {
    appVersion,
    nodeVersion: process.versions.node,
    nextRuntime: detectRuntime(),
  };
}

function detectRuntime(): SettingsRuntimeInfo["nextRuntime"] {
  if (typeof process === "undefined") return "edge";
  if (typeof process.versions?.node === "string") return "nodejs";
  return "unknown";
}

/**
 * Redacts the password portion of a postgres connection URL so we never leak
 * credentials into the rendered Settings UI even if someone screen-shares.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "Configured";
  }
}

export function isWorkspaceDbConfigured(): boolean {
  return readStorageStatus().databaseConfigured;
}
