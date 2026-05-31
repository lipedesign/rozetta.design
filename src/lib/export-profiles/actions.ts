"use server";

import { revalidatePath } from "next/cache";

import type { ExportProfile } from "@/lib/workspace/types";
import {
  loadExportProfilesFile,
  writeExportProfilesFile,
} from "./filesystem";

export interface ExportProfilesState {
  exists: boolean;
  profiles: ExportProfile[];
  path: string;
}

export type SaveExportProfilesResult =
  | { ok: true; path: string; profiles: ExportProfile[] }
  | { ok: false; error: string };

export async function getExportProfiles(): Promise<ExportProfilesState> {
  return loadExportProfilesFile();
}

export async function saveExportProfiles(
  profiles: ExportProfile[]
): Promise<SaveExportProfilesResult> {
  try {
    const path = await writeExportProfilesFile(profiles);
    revalidatePath("/exports");
    return { ok: true, path, profiles };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save export profiles.",
    };
  }
}
