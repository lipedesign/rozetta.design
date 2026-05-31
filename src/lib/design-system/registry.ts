import { flattenTokens } from "@/lib/dtcg/parser";
import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type {
  Brand,
  BrandStatus,
  ComponentStatus,
  DesignSystemChange,
  DesignSystemChangeKind,
  DesignSystemComponent,
  DesignSystemDiff,
  DesignSystemRegistryInput,
  DesignSystemPatchProposal,
  ExportProfile,
  ResolvedBrandPackage,
  ValidationIssue,
} from "@/lib/workspace/types";

const BRAND_STATUSES: BrandStatus[] = ["draft", "active", "deprecated"];
const COMPONENT_STATUSES: ComponentStatus[] = ["draft", "ready", "deprecated"];
const CHANGE_KINDS: DesignSystemChangeKind[] = [
  "theme-created",
  "theme-removed",
  "theme-updated",
  "brand-created",
  "brand-removed",
  "brand-updated",
  "component-created",
  "component-removed",
  "component-updated",
];

export interface DesignSystemInput {
  sets: TokenSet[];
  themes: Theme[];
  exportProfiles: ExportProfile[];
  brands: Brand[];
  components: DesignSystemComponent[];
}

export function normalizeBrands(value: unknown): Brand[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isBrandLike)
    .map((brand) => ({
      ...brand,
      slug: brand.slug || slugify(brand.name),
      status: BRAND_STATUSES.includes(brand.status) ? brand.status : "draft",
      tokenSetIds: uniqueStrings(brand.tokenSetIds),
      themeIds: uniqueStrings(brand.themeIds),
      exportProfileIds: uniqueStrings(brand.exportProfileIds),
      componentIds: uniqueStrings(brand.componentIds),
      figmaFile: brand.figmaFile
        ? {
            ...brand.figmaFile,
            mappings: Array.isArray(brand.figmaFile.mappings)
              ? brand.figmaFile.mappings
              : [],
          }
        : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeComponents(value: unknown): DesignSystemComponent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isComponentLike)
    .map((component) => ({
      ...component,
      slug: component.slug || slugify(component.name),
      category: component.category || "General",
      status: COMPONENT_STATUSES.includes(component.status) ? component.status : "draft",
      tokenRefs: uniqueStrings(component.tokenRefs),
      brandIds: uniqueStrings(component.brandIds),
      variants: Array.isArray(component.variants) ? component.variants : [],
      props: Array.isArray(component.props) ? component.props : [],
      states: Array.isArray(component.states) ? component.states : [],
      bindings: {
        code: Array.isArray(component.bindings?.code) ? component.bindings.code : [],
        figma: Array.isArray(component.bindings?.figma) ? component.bindings.figma : [],
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveBrandPackage(
  brandId: string,
  input: DesignSystemInput
): ResolvedBrandPackage | undefined {
  const brand = input.brands.find((item) => item.id === brandId);
  if (!brand) return undefined;

  const brandById = new Map(input.brands.map((item) => [item.id, item]));
  const inherited: Brand[] = [];
  const visited = new Set<string>();
  let cursor: Brand | undefined = brand;
  let cycleDetected = false;
  const missingBaseBrandIds: string[] = [];

  while (cursor?.baseBrandId) {
    if (visited.has(cursor.baseBrandId)) {
      cycleDetected = true;
      break;
    }
    visited.add(cursor.baseBrandId);
    const base = brandById.get(cursor.baseBrandId);
    if (!base) {
      missingBaseBrandIds.push(cursor.baseBrandId);
      break;
    }
    inherited.unshift(base);
    cursor = base;
  }

  const chain = [...inherited, brand];
  const tokenSetIds = uniqueStrings(chain.flatMap((item) => item.tokenSetIds));
  const themeIds = uniqueStrings(chain.flatMap((item) => item.themeIds));
  const exportProfileIds = uniqueStrings(chain.flatMap((item) => item.exportProfileIds));
  const componentIds = uniqueStrings(chain.flatMap((item) => item.componentIds));

  return {
    brand,
    inheritedBrandIds: inherited.map((item) => item.id),
    tokenSetIds,
    themeIds,
    exportProfileIds,
    componentIds,
    missing: {
      baseBrandIds: missingBaseBrandIds,
      tokenSetIds: missingIds(tokenSetIds, input.sets.map((set) => set.id)),
      themeIds: missingIds(themeIds, input.themes.map((theme) => theme.id)),
      exportProfileIds: missingIds(exportProfileIds, input.exportProfiles.map((profile) => profile.id)),
      componentIds: missingIds(componentIds, input.components.map((component) => component.id)),
    },
    cycleDetected,
  };
}

export function validateDesignSystem(input: DesignSystemInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const setIds = new Set(input.sets.map((set) => set.id));
  const themeIds = new Set(input.themes.map((theme) => theme.id));
  const exportProfileIds = new Set(input.exportProfiles.map((profile) => profile.id));
  const brandIds = new Set(input.brands.map((brand) => brand.id));
  const componentIds = new Set(input.components.map((component) => component.id));
  const tokenRefs = new Set(
    input.sets.flatMap((set) => flattenTokens(set).map((token) => `${set.id}:${token.path}`))
  );

  for (const brand of input.brands) {
    const resolved = resolveBrandPackage(brand.id, input);
    if (!resolved) continue;

    if (resolved.cycleDetected) {
      issues.push({
        id: `brand-cycle:${brand.id}`,
        severity: "error",
        source: { kind: "brand", brandId: brand.id },
        title: "Brand inheritance has a cycle",
        detail: `${brand.name} references a base brand chain that loops back on itself.`,
        action: "Choose a different base brand or clear the base brand field.",
      });
    }

    for (const missingId of resolved.missing.baseBrandIds) {
      issues.push({
        id: `brand-missing-base:${brand.id}:${missingId}`,
        severity: "error",
        source: { kind: "brand", brandId: brand.id },
        title: "Brand base is missing",
        detail: `${brand.name} inherits from ${missingId}, but that brand is not registered.`,
        action: "Restore the base brand or remove the inheritance reference.",
      });
    }

    for (const setId of brand.tokenSetIds.filter((id) => !setIds.has(id))) {
      issues.push(missingReferenceIssue(brand, "token set", setId));
    }
    for (const themeId of brand.themeIds.filter((id) => !themeIds.has(id))) {
      issues.push(missingReferenceIssue(brand, "theme", themeId));
    }
    for (const profileId of brand.exportProfileIds.filter((id) => !exportProfileIds.has(id))) {
      issues.push(missingReferenceIssue(brand, "export profile", profileId));
    }
    for (const componentId of brand.componentIds.filter((id) => !componentIds.has(id))) {
      issues.push(missingReferenceIssue(brand, "component", componentId));
    }
  }

  for (const component of input.components) {
    for (const brandId of component.brandIds) {
      if (brandIds.has(brandId)) continue;
      issues.push({
        id: `component-missing-brand:${component.id}:${brandId}`,
        severity: "warning",
        source: { kind: "component", componentId: component.id, brandId },
        title: "Component references a missing brand",
        detail: `${component.name} is scoped to ${brandId}, but that brand is not registered.`,
        action: "Remove the stale brand scope or restore the brand.",
      });
    }

    for (const tokenRef of component.tokenRefs) {
      if (tokenRefs.has(tokenRef)) continue;
      issues.push({
        id: `component-missing-token:${component.id}:${tokenRef}`,
        severity: "warning",
        source: { kind: "component", componentId: component.id, path: tokenRef },
        title: "Component token reference is missing",
        detail: `${component.name} references ${tokenRef}, but no loaded token matches set:path.`,
        action: "Update the token reference or add the missing token.",
      });
    }

    for (const [index, binding] of component.bindings.code.entries()) {
      if (binding.source.trim()) continue;
      issues.push({
        id: `component-code-binding:${component.id}:${index}`,
        severity: "info",
        source: { kind: "component", componentId: component.id },
        title: "Component code binding is incomplete",
        detail: `${component.name} has a code binding without a source path.`,
        action: "Add a source path or remove the placeholder binding.",
      });
    }

    for (const [index, binding] of component.bindings.figma.entries()) {
      if (binding.fileKey || binding.nodeId || binding.componentName) continue;
      issues.push({
        id: `component-figma-binding:${component.id}:${index}`,
        severity: "info",
        source: { kind: "component", componentId: component.id },
        title: "Component Figma binding is incomplete",
        detail: `${component.name} has an empty Figma binding placeholder.`,
        action: "Add Figma file/node metadata or remove the placeholder binding.",
      });
    }
  }

  return issues;
}

export function diffDesignSystemRegistry(
  baseline: DesignSystemRegistryInput,
  current: DesignSystemRegistryInput
): DesignSystemDiff {
  const changes: DesignSystemChange[] = [
    ...diffEntity("themes", baseline.themes, current.themes),
    ...diffEntity("brands", baseline.brands, current.brands),
    ...diffEntity("components", baseline.components, current.components),
  ];

  changes.sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    changes,
    summary: summarizeChanges(changes),
  };
}

export function proposeDesignSystemPatch(issues: ValidationIssue[]): DesignSystemPatchProposal {
  return {
    appliesAutomatically: false,
    proposals: issues
      .filter((issue) =>
        issue.source.kind === "brand" ||
        issue.source.kind === "component" ||
        issue.source.kind === "design-system"
      )
      .map((issue) => ({
        id: `proposal:${issue.id}`,
        title: issue.title,
        detail: issue.action,
        source: issue.source,
      })),
  };
}

export function createBrandDraft(input: {
  name: string;
  brands: Brand[];
  baseBrandId?: string;
}): Brand {
  const now = new Date().toISOString();
  const id = uniqueId(input.brands.map((brand) => brand.id), slugify(input.name));
  return {
    id,
    name: input.name,
    slug: id,
    description: undefined,
    status: "draft",
    baseBrandId: input.baseBrandId,
    tokenSetIds: [],
    themeIds: [],
    exportProfileIds: [],
    componentIds: [],
    updatedAt: now,
  };
}

export function createComponentDraft(input: {
  name: string;
  components: DesignSystemComponent[];
  category?: string;
}): DesignSystemComponent {
  const now = new Date().toISOString();
  const id = uniqueId(input.components.map((component) => component.id), slugify(input.name));
  return {
    id,
    name: input.name,
    slug: id,
    description: undefined,
    category: input.category || "General",
    status: "draft",
    tokenRefs: [],
    variants: [],
    props: [],
    states: [],
    bindings: { code: [], figma: [] },
    brandIds: [],
    updatedAt: now,
  };
}

function diffEntity(
  area: "themes" | "brands" | "components",
  baseline: Array<{ id: string; name: string }>,
  current: Array<{ id: string; name: string }>
): DesignSystemChange[] {
  const changes: DesignSystemChange[] = [];
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  const currentById = new Map(current.map((item) => [item.id, item]));
  const prefix = area.slice(0, -1) as "theme" | "brand" | "component";

  for (const item of current) {
    const before = baselineById.get(item.id);
    if (!before) {
      changes.push({
        id: `${prefix}-created:${item.id}`,
        kind: `${prefix}-created` as DesignSystemChangeKind,
        area,
        name: item.name,
        after: item.name,
      });
      continue;
    }
    if (stableStringify(before) !== stableStringify(item)) {
      changes.push({
        id: `${prefix}-updated:${item.id}`,
        kind: `${prefix}-updated` as DesignSystemChangeKind,
        area,
        name: item.name,
        before: before.name,
        after: item.name,
      });
    }
  }

  for (const item of baseline) {
    if (currentById.has(item.id)) continue;
    changes.push({
      id: `${prefix}-removed:${item.id}`,
      kind: `${prefix}-removed` as DesignSystemChangeKind,
      area,
      name: item.name,
      before: item.name,
    });
  }

  return changes;
}

function missingReferenceIssue(brand: Brand, kind: string, id: string): ValidationIssue {
  return {
    id: `brand-missing-${kind.replace(/\s+/g, "-")}:${brand.id}:${id}`,
    severity: "warning",
    source: { kind: "brand", brandId: brand.id },
    title: "Brand package has a missing reference",
    detail: `${brand.name} references ${kind} ${id}, but it is not available.`,
    action: `Remove ${id} from the brand package or restore the missing ${kind}.`,
  };
}

function summarizeChanges(changes: DesignSystemChange[]): DesignSystemDiff["summary"] {
  const summary = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, 0])) as Record<
    DesignSystemChangeKind,
    number
  >;
  for (const change of changes) summary[change.kind] += 1;
  return { ...summary, total: changes.length };
}

function isBrandLike(value: unknown): value is Brand {
  if (!value || typeof value !== "object") return false;
  const brand = value as Record<string, unknown>;
  return (
    typeof brand.id === "string" &&
    typeof brand.name === "string" &&
    typeof brand.updatedAt === "string" &&
    Array.isArray(brand.tokenSetIds) &&
    Array.isArray(brand.themeIds) &&
    Array.isArray(brand.exportProfileIds) &&
    Array.isArray(brand.componentIds)
  );
}

function isComponentLike(value: unknown): value is DesignSystemComponent {
  if (!value || typeof value !== "object") return false;
  const component = value as Record<string, unknown>;
  return (
    typeof component.id === "string" &&
    typeof component.name === "string" &&
    typeof component.updatedAt === "string" &&
    Array.isArray(component.tokenRefs) &&
    Array.isArray(component.brandIds)
  );
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

function missingIds(ids: string[], existingIds: string[]): string[] {
  const existing = new Set(existingIds);
  return ids.filter((id) => !existing.has(id));
}

function uniqueId(existingIds: string[], base: string): string {
  let id = base || "item";
  let index = 2;
  while (existingIds.includes(id)) id = `${base}-${index++}`;
  return id;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
