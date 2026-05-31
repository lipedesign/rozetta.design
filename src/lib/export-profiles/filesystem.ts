import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeExportProfiles } from "@/lib/workspace/export-profiles";
import type { ExportProfile } from "@/lib/workspace/types";

const ROZETTA_DIR = path.join(process.cwd(), ".rozetta");
const EXPORT_PROFILES_PATH = path.join(ROZETTA_DIR, "export-profiles.json");

export interface ExportProfilesFile {
  exists: boolean;
  profiles: ExportProfile[];
  path: string;
}

export async function loadExportProfilesFile(): Promise<ExportProfilesFile> {
  try {
    const raw = await fs.readFile(EXPORT_PROFILES_PATH, "utf-8");
    return {
      exists: true,
      profiles: normalizeExportProfiles(JSON.parse(raw)),
      path: EXPORT_PROFILES_PATH,
    };
  } catch (err) {
    if (isMissingFileError(err)) {
      return { exists: false, profiles: [], path: EXPORT_PROFILES_PATH };
    }
    console.warn("[export-profiles] failed to read file", err);
    return { exists: false, profiles: [], path: EXPORT_PROFILES_PATH };
  }
}

export async function writeExportProfilesFile(
  profiles: ExportProfile[]
): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  const normalized = normalizeExportProfiles(profiles);
  await fs.writeFile(
    EXPORT_PROFILES_PATH,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf-8"
  );
  return EXPORT_PROFILES_PATH;
}

function isMissingFileError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
