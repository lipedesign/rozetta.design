"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getWorkspaceContext, requireWorkspaceRole } from "@/lib/auth/workspace-context";
import {
  deleteComponent,
  listComponents,
  upsertComponent,
} from "@/lib/db/repositories/design-components";
import type { Brand, DesignSystemComponent } from "@/lib/workspace/types";
import { loadBrandsFile, writeBrandsFile } from "./filesystem";
import { normalizeComponents } from "./registry";

// The Git-versioned components artifact is now export-only (generated on
// Save/PR); the operational source of truth is the workspace DB. The path is
// kept on the result for shape parity with the legacy file contract.
const COMPONENTS_ARTIFACT_PATH = ".rozetta/components.json";

const componentInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();
const componentsInputSchema = z.array(componentInputSchema);

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
  const components = await listComponents();
  return {
    exists: components.length > 0,
    path: COMPONENTS_ARTIFACT_PATH,
    components,
  };
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
    const parsed = componentsInputSchema.safeParse(components);
    if (!parsed.success) {
      return { ok: false, error: "Invalid component payload." };
    }

    const context = await getWorkspaceContext();
    requireWorkspaceRole(context, "editor");

    const normalized = normalizeComponents(parsed.data);
    const existing = await listComponents(context);
    const nextIds = new Set(normalized.map((component) => component.id));

    for (const component of existing) {
      if (!nextIds.has(component.id)) {
        await deleteComponent(component.id, context);
      }
    }
    for (const component of normalized) {
      await upsertComponent(component, context);
    }

    revalidateDesignSystemRoutes();
    return {
      ok: true,
      path: COMPONENTS_ARTIFACT_PATH,
      components: await listComponents(context),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save components.",
    };
  }
}

function revalidateDesignSystemRoutes() {
  // Components are part of the persistent `(studio)` layout hydrate; the paused
  // `/brands` page reads its own copy via the shell loader, which the layout
  // revalidation also covers.
  revalidatePath("/", "layout");
}
