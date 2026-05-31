import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeBrands, normalizeComponents } from "./registry";
import type { Brand, DesignSystemComponent } from "@/lib/workspace/types";

const ROZETTA_DIR = path.join(process.cwd(), ".rozetta");
const BRANDS_PATH = path.join(ROZETTA_DIR, "brands.json");
const COMPONENTS_PATH = path.join(ROZETTA_DIR, "components.json");

export interface BrandsFile {
  exists: boolean;
  path: string;
  brands: Brand[];
}

export interface ComponentsFile {
  exists: boolean;
  path: string;
  components: DesignSystemComponent[];
}

export async function loadBrandsFile(): Promise<BrandsFile> {
  try {
    const raw = await fs.readFile(BRANDS_PATH, "utf-8");
    return { exists: true, path: BRANDS_PATH, brands: normalizeBrands(JSON.parse(raw)) };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[brands] failed to read file", err);
    return { exists: false, path: BRANDS_PATH, brands: [] };
  }
}

export async function loadComponentsFile(): Promise<ComponentsFile> {
  try {
    const raw = await fs.readFile(COMPONENTS_PATH, "utf-8");
    return {
      exists: true,
      path: COMPONENTS_PATH,
      components: normalizeComponents(JSON.parse(raw)),
    };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[components] failed to read file", err);
    return { exists: false, path: COMPONENTS_PATH, components: [] };
  }
}

export async function writeBrandsFile(brands: Brand[]): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(
    BRANDS_PATH,
    `${JSON.stringify(normalizeBrands(brands), null, 2)}\n`,
    "utf-8"
  );
  return BRANDS_PATH;
}

export async function writeComponentsFile(components: DesignSystemComponent[]): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(
    COMPONENTS_PATH,
    `${JSON.stringify(normalizeComponents(components), null, 2)}\n`,
    "utf-8"
  );
  return COMPONENTS_PATH;
}

function isMissingFileError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
