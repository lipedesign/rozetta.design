"use client";

import { create } from "zustand";

import { saveBrands, saveComponents } from "./actions";
import {
  createBrandDraft,
  createComponentDraft,
  normalizeBrands,
  normalizeComponents,
} from "./registry";
import type {
  Brand,
  BrandStatus,
  ComponentStatus,
  DesignSystemComponent,
} from "@/lib/workspace/types";

/** Result of an awaited component mutation — `{ ok: false }` means the store rolled back. */
export type ComponentPersistResult = { ok: true } | { ok: false; error: string };

interface DesignSystemState {
  brands: Brand[];
  components: DesignSystemComponent[];
  activeBrandId: string | null;
  activeComponentId: string | null;
  hydrate: (input: { brands: Brand[]; components: DesignSystemComponent[] }) => void;
  createBrand: (name: string, baseBrandId?: string) => Brand;
  updateBrand: (id: string, patch: Partial<Brand>) => void;
  duplicateBrand: (id: string) => Brand | undefined;
  deleteBrand: (id: string) => void;
  selectBrand: (id: string | null) => void;
  createComponent: (name: string, category?: string) => Promise<ComponentPersistResult>;
  updateComponent: (id: string, patch: Partial<DesignSystemComponent>) => Promise<ComponentPersistResult>;
  duplicateComponent: (id: string) => Promise<ComponentPersistResult>;
  deleteComponent: (id: string) => Promise<ComponentPersistResult>;
  selectComponent: (id: string | null) => void;
}

export const useDesignSystemStore = create<DesignSystemState>((set, get) => ({
  brands: [],
  components: [],
  activeBrandId: null,
  activeComponentId: null,

  hydrate(input) {
    const brands = normalizeBrands(input.brands);
    const components = normalizeComponents(input.components);
    set({
      brands,
      components,
      activeBrandId: get().activeBrandId ?? brands[0]?.id ?? null,
      activeComponentId: get().activeComponentId ?? components[0]?.id ?? null,
    });
  },

  createBrand(name, baseBrandId) {
    const brands = get().brands;
    const brand = createBrandDraft({ name, brands, baseBrandId });
    const next = [brand, ...brands];
    persistBrands(next);
    set({ brands: next, activeBrandId: brand.id });
    return brand;
  },

  updateBrand(id, patch) {
    const next = get().brands.map((brand) =>
      brand.id === id ? normalizeBrandPatch(brand, patch) : brand
    );
    persistBrands(next);
    set({ brands: next });
  },

  duplicateBrand(id) {
    const source = get().brands.find((brand) => brand.id === id);
    if (!source) return undefined;
    const draft = createBrandDraft({
      name: `${source.name} Copy`,
      brands: get().brands,
      baseBrandId: source.baseBrandId,
    });
    const copy: Brand = {
      ...source,
      id: draft.id,
      name: draft.name,
      slug: draft.slug,
      status: "draft",
      updatedAt: new Date().toISOString(),
    };
    const next = [copy, ...get().brands];
    persistBrands(next);
    set({ brands: next, activeBrandId: copy.id });
    return copy;
  },

  deleteBrand(id) {
    const nextBrands = get().brands.filter((brand) => brand.id !== id);
    const nextComponents = get().components.map((component) => ({
      ...component,
      brandIds: component.brandIds.filter((brandId) => brandId !== id),
    }));
    persistBrands(nextBrands);
    persistComponents(nextComponents);
    set({
      brands: nextBrands,
      components: nextComponents,
      activeBrandId: get().activeBrandId === id ? nextBrands[0]?.id ?? null : get().activeBrandId,
    });
  },

  selectBrand(id) {
    set({ activeBrandId: id });
  },

  async createComponent(name, category) {
    const prevComponents = get().components;
    const prevActive = get().activeComponentId;
    const component = createComponentDraft({ name, components: prevComponents, category });
    const next = [component, ...prevComponents];
    set({ components: next, activeComponentId: component.id });
    const result = await persistComponents(next);
    if (!result.ok) set({ components: prevComponents, activeComponentId: prevActive });
    return result;
  },

  async updateComponent(id, patch) {
    const prevComponents = get().components;
    const next = prevComponents.map((component) =>
      component.id === id ? normalizeComponentPatch(component, patch) : component
    );
    set({ components: next });
    const result = await persistComponents(next);
    if (!result.ok) set({ components: prevComponents });
    return result;
  },

  async duplicateComponent(id) {
    const prevComponents = get().components;
    const prevActive = get().activeComponentId;
    const source = prevComponents.find((component) => component.id === id);
    if (!source) return { ok: true };
    const draft = createComponentDraft({
      name: `${source.name} Copy`,
      components: prevComponents,
      category: source.category,
    });
    const copy: DesignSystemComponent = {
      ...source,
      id: draft.id,
      name: draft.name,
      slug: draft.slug,
      status: "draft",
      updatedAt: new Date().toISOString(),
    };
    const next = [copy, ...prevComponents];
    set({ components: next, activeComponentId: copy.id });
    const result = await persistComponents(next);
    if (!result.ok) set({ components: prevComponents, activeComponentId: prevActive });
    return result;
  },

  async deleteComponent(id) {
    const prevComponents = get().components;
    const prevBrands = get().brands;
    const prevActive = get().activeComponentId;
    const nextComponents = prevComponents.filter((component) => component.id !== id);
    const nextBrands = prevBrands.map((brand) => ({
      ...brand,
      componentIds: brand.componentIds.filter((componentId) => componentId !== id),
    }));
    set({
      brands: nextBrands,
      components: nextComponents,
      activeComponentId: prevActive === id ? nextComponents[0]?.id ?? null : prevActive,
    });
    persistBrands(nextBrands);
    const result = await persistComponents(nextComponents);
    if (!result.ok) {
      set({ brands: prevBrands, components: prevComponents, activeComponentId: prevActive });
    }
    return result;
  },

  selectComponent(id) {
    set({ activeComponentId: id });
  },
}));

function persistBrands(brands: Brand[]): void {
  void saveBrands(brands);
}

async function persistComponents(
  components: DesignSystemComponent[]
): Promise<ComponentPersistResult> {
  const result = await saveComponents(components);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function normalizeBrandPatch(brand: Brand, patch: Partial<Brand>): Brand {
  return {
    ...brand,
    ...patch,
    status: normalizeBrandStatus(patch.status ?? brand.status),
    tokenSetIds: uniqueStrings(patch.tokenSetIds ?? brand.tokenSetIds),
    themeIds: uniqueStrings(patch.themeIds ?? brand.themeIds),
    exportProfileIds: uniqueStrings(patch.exportProfileIds ?? brand.exportProfileIds),
    componentIds: uniqueStrings(patch.componentIds ?? brand.componentIds),
    baseBrandId: Object.prototype.hasOwnProperty.call(patch, "baseBrandId")
      ? patch.baseBrandId || undefined
      : brand.baseBrandId,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeComponentPatch(
  component: DesignSystemComponent,
  patch: Partial<DesignSystemComponent>
): DesignSystemComponent {
  return {
    ...component,
    ...patch,
    status: normalizeComponentStatus(patch.status ?? component.status),
    tokenRefs: uniqueStrings(patch.tokenRefs ?? component.tokenRefs),
    brandIds: uniqueStrings(patch.brandIds ?? component.brandIds),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeBrandStatus(status: BrandStatus): BrandStatus {
  return ["draft", "active", "deprecated"].includes(status) ? status : "draft";
}

function normalizeComponentStatus(status: ComponentStatus): ComponentStatus {
  return ["draft", "ready", "deprecated"].includes(status) ? status : "draft";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
