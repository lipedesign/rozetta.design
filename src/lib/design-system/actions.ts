"use server";

import { revalidatePath } from "next/cache";

import type { Brand, DesignSystemComponent } from "@/lib/workspace/types";
import {
  loadBrandsFile,
  loadComponentsFile,
  writeBrandsFile,
  writeComponentsFile,
} from "./filesystem";

export interface BrandsStateFile {
  exists: boolean;
  path: string;
  brands: Brand[];
}

export interface ComponentsStateFile {
  exists: boolean;
  path: string;
  components: DesignSystemComponent[];
}

export type SaveBrandsResult =
  | { ok: true; path: string; brands: Brand[] }
  | { ok: false; error: string };

export type SaveComponentsResult =
  | { ok: true; path: string; components: DesignSystemComponent[] }
  | { ok: false; error: string };

export async function getBrands(): Promise<BrandsStateFile> {
  return loadBrandsFile();
}

export async function getComponents(): Promise<ComponentsStateFile> {
  return loadComponentsFile();
}

export async function saveBrands(brands: Brand[]): Promise<SaveBrandsResult> {
  try {
    const path = await writeBrandsFile(brands);
    revalidateDesignSystemRoutes();
    return { ok: true, path, brands };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save brands.",
    };
  }
}

export async function saveComponents(
  components: DesignSystemComponent[]
): Promise<SaveComponentsResult> {
  try {
    const path = await writeComponentsFile(components);
    revalidateDesignSystemRoutes();
    return { ok: true, path, components };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save components.",
    };
  }
}

function revalidateDesignSystemRoutes() {
  // Brands/components are part of the persistent `(studio)` layout hydrate; the
  // paused `/brands` page reads its own copy via `getProductShellData`, which
  // the layout revalidation also covers.
  revalidatePath("/", "layout");
}
