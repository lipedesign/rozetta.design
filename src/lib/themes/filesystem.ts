import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeThemes } from "./registry";
import type { Theme } from "./types";

const ROZETTA_DIR = path.join(process.cwd(), ".rozetta");
const THEMES_PATH = path.join(ROZETTA_DIR, "themes.json");

export interface ThemesFile {
  exists: boolean;
  path: string;
  themes: Theme[];
}

export async function loadThemesFile(): Promise<ThemesFile> {
  try {
    const raw = await fs.readFile(THEMES_PATH, "utf-8");
    return {
      exists: true,
      path: THEMES_PATH,
      themes: normalizeThemes(JSON.parse(raw)),
    };
  } catch (err) {
    if (!isMissingFileError(err)) {
      console.warn("[themes] failed to read file", err);
    }
    return { exists: false, path: THEMES_PATH, themes: [] };
  }
}

export async function writeThemesFile(themes: Theme[]): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  const normalized = normalizeThemes(themes);
  await fs.writeFile(THEMES_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return THEMES_PATH;
}

function isMissingFileError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
