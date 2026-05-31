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
  createComponent: (name: string, category?: string) => DesignSystemComponent;
  updateComponent: (id: string, patch: Partial<DesignSystemComponent>) => void;
  duplicateComponent: (id: string) => DesignSystemComponent | undefined;
  deleteComponent: (id: string) => void;
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

  createComponent(name, category) {
    const components = get().components;
    const component = createComponentDraft({ name, components, category });
    const next = [component, ...components];
    persistComponents(next);
    set({ components: next, activeComponentId: component.id });
    return component;
  },

  updateComponent(id, patch) {
    const next = get().components.map((component) =>
      component.id === id ? normalizeComponentPatch(component, patch) : component
    );
    persistComponents(next);
    set({ components: next });
  },

  duplicateComponent(id) {
    const source = get().components.find((component) => component.id === id);
    if (!source) return undefined;
    const draft = createComponentDraft({
      name: `${source.name} Copy`,
      components: get().components,
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
    const next = [copy, ...get().components];
    persistComponents(next);
    set({ components: next, activeComponentId: copy.id });
    return copy;
  },

  deleteComponent(id) {
    const nextComponents = get().components.filter((component) => component.id !== id);
    const nextBrands = get().brands.map((brand) => ({
      ...brand,
      componentIds: brand.componentIds.filter((componentId) => componentId !== id),
    }));
    persistComponents(nextComponents);
    persistBrands(nextBrands);
    set({
      brands: nextBrands,
      components: nextComponents,
      activeComponentId: get().activeComponentId === id ? nextComponents[0]?.id ?? null : get().activeComponentId,
    });
  },

  selectComponent(id) {
    set({ activeComponentId: id });
  },
}));

function persistBrands(brands: Brand[]): void {
  void saveBrands(brands);
}

function persistComponents(components: DesignSystemComponent[]): void {
  void saveComponents(components);
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
