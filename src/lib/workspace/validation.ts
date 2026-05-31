import { formatColorForCss } from "@/lib/dtcg/format";
import { getCollectionModes, materializeCollectionMode } from "@/lib/dtcg/collections";
import { getNodeAtPath, isAliasValue } from "@/lib/dtcg/parser";
import { readFigmaAlias, resolveToken } from "@/lib/dtcg/resolver";
import { getSemanticMeta } from "@/lib/dtcg/semantic";
import {
  DTCG_TYPES,
  isDtcgGroup,
  isDtcgToken,
  type DtcgGroup,
  type DtcgToken,
  type DtcgType,
  type DtcgValue,
  type TokenSet,
} from "@/lib/dtcg/types";
import { flattenTokens } from "@/lib/dtcg/parser";
import { validateDesignSystem } from "@/lib/design-system/registry";
import { resolveTheme } from "@/lib/themes/resolver";
import type { Theme } from "@/lib/themes/types";
import type {
  Brand,
  DesignSystemComponent,
  ExportProfile,
  GitStatusSummary,
  ValidationIssue,
  WorkspaceHealth,
} from "./types";

interface BuildWorkspaceHealthInput {
  sets: TokenSet[];
  themes: Theme[];
  exportProfiles?: ExportProfile[];
  brands?: Brand[];
  components?: DesignSystemComponent[];
  dirtySetIds?: string[];
  localOnlySetIds?: string[];
  git?: GitStatusSummary;
}

interface RawTokenEntry {
  path: string;
  token: DtcgToken;
  inheritedType?: DtcgType;
}

export function buildWorkspaceHealth({
  sets,
  themes,
  exportProfiles = [],
  brands = [],
  components = [],
  dirtySetIds = [],
  localOnlySetIds = [],
  git,
}: BuildWorkspaceHealthInput): WorkspaceHealth {
  const issues: ValidationIssue[] = [];
  const dirty = new Set(dirtySetIds);
  const localOnly = new Set(localOnlySetIds);
  const setIds = new Set(sets.map((set) => set.id));
  const MAX_TIER_MISSING_ISSUES = 20;
  let tierMissingEmitted = 0;
  const tierMissingSeen = new Set<string>();
  const tokenCount = sets.reduce(
    (count, set) =>
      count +
      getCollectionModes(set).reduce(
        (modeCount, mode) => modeCount + walkRawTokens(materializeCollectionMode(set, mode.id).root).length,
        0
      ),
    0
  );

  for (const set of sets) {
    if (localOnly.has(set.id)) {
      issues.push({
        id: `local-only:${set.id}`,
        severity: "info",
        source: { kind: "collection", collectionId: set.id, setId: set.id, file: set.filename },
        title: `${set.name} only exists locally`,
        detail: "This collection does not have a saved baseline yet.",
        action: "Save the workspace when the collection is ready to keep.",
      });
    }

    for (const mode of getCollectionModes(set)) {
      const materializedSet = materializeCollectionMode(set, mode.id);
      const modeLabel = `${set.name} / ${mode.name}`;

      for (const entry of walkRawTokens(materializedSet.root)) {
        const resolvedType = entry.token.$type ?? entry.inheritedType;
        if (!resolvedType) {
          issues.push({
            id: `missing-type:${set.id}:${mode.id}:${entry.path}`,
            severity: "error",
            source: { kind: "token", setId: set.id, path: entry.path },
            title: "Token is missing a type",
            detail: `${modeLabel}/${entry.path} has no $type and no typed parent group.`,
            action: "Add a $type to the token or one of its parent groups.",
          });
          continue;
        }

        if (!isSupportedType(resolvedType)) {
          issues.push({
            id: `unsupported-type:${set.id}:${mode.id}:${entry.path}`,
            severity: "warning",
            source: { kind: "token", setId: set.id, path: entry.path },
            title: "Token type is outside the supported DTCG set",
            detail: `${resolvedType} is not one of the supported Rozetta token types.`,
            action: "Map the token to a supported type before exporting to code.",
          });
          continue;
        }

        const invalidReason = validateTokenValue(entry.token.$value, resolvedType);
        if (invalidReason) {
          issues.push({
            id: `invalid-value:${set.id}:${mode.id}:${entry.path}`,
            severity: "warning",
            source: { kind: "token", setId: set.id, path: entry.path },
            title: "Token value does not match its type",
            detail: `${modeLabel}/${entry.path}: ${invalidReason}`,
            action: "Edit the token value or change the token type.",
          });
        }

        if (
          tierMissingEmitted < MAX_TIER_MISSING_ISSUES &&
          entry.token.$type !== undefined &&
          entry.token.$value !== undefined &&
          getSemanticMeta(entry.token) === null
        ) {
          const dedupeKey = `${set.id}:${entry.path}`;
          if (!tierMissingSeen.has(dedupeKey)) {
            tierMissingSeen.add(dedupeKey);
            issues.push({
              id: `tier-missing:${set.id}:${entry.path}`,
              severity: "info",
              source: { kind: "token", setId: set.id, path: entry.path },
              title: "Token has no semantic tier",
              detail:
                "Add com.rozetta.semantic to $extensions, or it will be inferred at runtime.",
              action: "Set tier via the token editor.",
            });
            tierMissingEmitted += 1;
          }
        }
      }

      for (const token of flattenTokens(materializedSet)) {
        const node = getNodeAtPath(materializedSet.root, token.path);
        const hasFigmaAlias = node && isDtcgToken(node) && Boolean(readFigmaAlias(node)?.targetVariableName);
        if (!token.isAlias && !hasFigmaAlias) continue;

        const resolved = resolveToken(set.id, token.path, {
          currentSetId: set.id,
          sets: sets.map((candidate) => (candidate.id === set.id ? materializedSet : candidate)),
        });

        if (resolved.error) {
          issues.push({
            id: `alias-${resolved.error}:${set.id}:${mode.id}:${token.path}`,
            severity: "error",
            source: { kind: "token", setId: set.id, path: token.path },
            title: "Alias cannot be resolved",
            detail: `${modeLabel}/${token.path} resolves to ${resolved.error}.`,
            action: "Update the alias target or add the missing source token.",
          });
        }
      }
    }
  }

  for (const theme of themes) {
    for (const ref of theme.sets) {
      const collectionId = ref.collectionId ?? ref.setId;
      if (setIds.has(collectionId)) continue;
      issues.push({
        id: `missing-theme-collection:${theme.id}:${collectionId}`,
        severity: "error",
        source: { kind: "theme", themeId: theme.id, setId: collectionId },
        title: "Theme references a missing collection",
        detail: `${theme.name} includes ${collectionId}, but that collection is not loaded.`,
        action: "Remove the missing collection from the theme or import it again.",
      });
    }

    const resolved = resolveTheme(theme, sets);
    for (const conflict of resolved.conflicts) {
      issues.push({
        id: `theme-conflict:${theme.id}:${conflict.path}`,
        severity: "warning",
        source: { kind: "theme", themeId: theme.id, path: conflict.path },
        title: "Theme has an overridden token",
        detail: `${conflict.path} is defined in ${conflict.setIds.join(", ")}. ${conflict.winnerId} wins.`,
        action: "Confirm that the last-wins override is intentional.",
      });
    }
  }

  issues.push(
    ...validateDesignSystem({
      sets,
      themes,
      exportProfiles,
      brands,
      components,
    })
  );

  if (git?.available && !git.clean) {
    issues.push({
      id: "git-dirty-worktree",
      severity: "info",
      source: { kind: "git" },
      title: "Git worktree has local changes",
      detail: `${git.files.length} changed ${git.files.length === 1 ? "file" : "files"} on ${git.branch}.`,
      action: "Review Branches before preparing a release draft.",
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;

  return {
    generatedAt: new Date().toISOString(),
    git,
    issues,
    summary: {
      sets: sets.length,
      tokens: tokenCount,
      themes: themes.length,
      brands: brands.length,
      components: components.length,
      dirtySets: dirty.size,
      localOnlySets: localOnly.size,
      errors,
      warnings,
      infos,
    },
  };
}

function walkRawTokens(
  root: DtcgGroup,
  parentPath = "",
  inheritedType?: DtcgType
): RawTokenEntry[] {
  const groupType = (root.$type as DtcgType | undefined) ?? inheritedType;
  const entries: RawTokenEntry[] = [];

  for (const [key, child] of Object.entries(root)) {
    if (key.startsWith("$")) continue;
    const childPath = parentPath ? `${parentPath}.${key}` : key;
    if (isDtcgToken(child)) {
      entries.push({ path: childPath, token: child, inheritedType: groupType });
    } else if (isDtcgGroup(child)) {
      entries.push(...walkRawTokens(child, childPath, groupType));
    }
  }

  return entries;
}

function isSupportedType(type: string): type is DtcgType {
  return (DTCG_TYPES as readonly string[]).includes(type);
}

function validateTokenValue(value: DtcgValue, type: DtcgType): string | undefined {
  if (isAliasValue(value)) return undefined;

  switch (type) {
    case "color":
      return formatColorForCss(value) ? undefined : "expected a valid CSS/DTCG color.";
    case "number":
      return typeof value === "number" ? undefined : "expected a number.";
    case "string":
    case "fontFamily":
    case "fontWeight":
      return typeof value === "string" || typeof value === "number"
        ? undefined
        : "expected a string or number.";
    case "dimension":
    case "duration":
      return isDimensionLike(value) ? undefined : "expected a number, unit string, or DTCG unit object.";
    case "cubicBezier":
      return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number")
        ? undefined
        : "expected four numeric bezier points.";
    case "shadow":
      return isObjectOrObjectArray(value) ? undefined : "expected a shadow object or list of shadow objects.";
    case "gradient":
      return Array.isArray(value) ? undefined : "expected a gradient stop array.";
    case "typography":
    case "border":
    case "transition":
    case "strokeStyle":
      return value && typeof value === "object" && !Array.isArray(value)
        ? undefined
        : "expected a composite object.";
    default:
      return undefined;
  }
}

function isDimensionLike(value: DtcgValue): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string") {
    return /^-?\d+(\.\d+)?(px|rem|em|ms|s|%|vh|vw|vmin|vmax)?$/.test(value.trim());
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return "value" in value && "unit" in value;
  }
  return false;
}

function isObjectOrObjectArray(value: DtcgValue): boolean {
  if (Array.isArray(value)) {
    return value.every((item) => item && typeof item === "object" && !Array.isArray(item));
  }
  return Boolean(value && typeof value === "object");
}
