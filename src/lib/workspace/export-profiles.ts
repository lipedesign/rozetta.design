import { EXPORT_FORMATS, runExport, type ExportFormatId } from "@/lib/exporters";
import type { TokenSet } from "@/lib/dtcg/types";
import { resolveTheme } from "@/lib/themes/resolver";
import type { Theme } from "@/lib/themes/types";
import type {
  ExportProfile,
  ExportProfileFormat,
  ExportProfilePreview,
  ExportProfileStatus,
  ExportProfileTargetKind,
} from "./types";

const ACTIVE_EXPORT_FORMATS = new Set<ExportFormatId>(["css", "tailwind", "json"]);
const VALID_TARGET_KINDS = new Set<ExportProfileTargetKind>(["collection", "set", "theme"]);
const VALID_FORMATS = new Set<ExportProfileFormat>(["css", "tailwind", "json", "style-dictionary"]);

export function resolveExportProfileStatus(
  profile: ExportProfile,
  sets: TokenSet[],
  themes: Theme[]
): ExportProfileStatus {
  const target = findProfileTarget(profile, sets, themes);
  if (!target) return "missing-target";
  if (!ACTIVE_EXPORT_FORMATS.has(profile.format as ExportFormatId)) return "planned-format";
  return "valid";
}

export function previewExportProfile(
  profile: ExportProfile,
  sets: TokenSet[],
  themes: Theme[]
): ExportProfilePreview {
  const target = findProfileTarget(profile, sets, themes);
  if (!target) {
    return {
      profileId: profile.id,
      status: "missing-target",
      targetName: profile.targetId,
      filename: "",
      language: "text",
      output: "",
      message: `${profile.targetKind} "${profile.targetId}" is not loaded in this workspace.`,
      conflicts: 0,
    };
  }

  if (!ACTIVE_EXPORT_FORMATS.has(profile.format as ExportFormatId)) {
    return {
      profileId: profile.id,
      status: "planned-format",
      targetName: target.name,
      filename: "",
      language: "text",
      output: "",
      message: "Style Dictionary export profiles are planned, but no artifact is generated yet.",
      conflicts: target.kind === "theme" ? target.conflicts : 0,
    };
  }

  const format = profile.format as ExportFormatId;
  const formatMeta = EXPORT_FORMATS.find((item) => item.id === format)!;
  const exportSet = target.set;
  const scope =
    target.kind === "theme"
      ? [exportSet, ...sets.filter((set) => set.id !== exportSet.id)]
      : sets;
  const output = runExport(format, exportSet, scope);

  return {
    profileId: profile.id,
    status: "valid",
    targetName: target.name,
    filename: formatMeta.filename(exportSet.name),
    language: formatMeta.language,
    output,
    message: `${formatMeta.label} preview generated for ${target.name}.`,
    conflicts: target.kind === "theme" ? target.conflicts : 0,
  };
}

/**
 * Normalize and migrate persisted profiles. Legacy entries written before the
 * Theme integration may be missing `targetKind` — those default to `"collection"`
 * so existing presets keep working without manual migration.
 */
export function normalizeExportProfiles(value: unknown): ExportProfile[] {
  if (!Array.isArray(value)) return [];
  const out: ExportProfile[] = [];
  for (const candidate of value) {
    const migrated = migrateLegacyProfile(candidate);
    if (migrated) out.push(migrated);
  }
  return out;
}

type ProfileTarget =
  | { kind: "collection"; name: string; set: TokenSet }
  | {
      kind: "theme";
      name: string;
      theme: Theme;
      set: TokenSet;
      conflicts: number;
    };

function findProfileTarget(
  profile: ExportProfile,
  sets: TokenSet[],
  themes: Theme[]
): ProfileTarget | undefined {
  if (profile.targetKind === "collection" || profile.targetKind === "set") {
    const set = sets.find((item) => item.id === profile.targetId);
    return set ? { kind: "collection", name: set.name, set } : undefined;
  }

  const theme = themes.find((item) => item.id === profile.targetId);
  if (!theme) return undefined;
  const resolved = resolveTheme(theme, sets);
  return {
    kind: "theme",
    name: theme.name,
    theme,
    set: resolved.merged,
    conflicts: resolved.conflicts.length,
  };
}

function migrateLegacyProfile(value: unknown): ExportProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const profile = value as Record<string, unknown>;
  if (typeof profile.id !== "string") return undefined;
  if (typeof profile.name !== "string") return undefined;
  if (typeof profile.targetId !== "string") return undefined;
  if (typeof profile.destination !== "string") return undefined;
  if (typeof profile.updatedAt !== "string") return undefined;
  if (!isExportProfileFormat(profile.format)) return undefined;
  const targetKind = isExportProfileTargetKind(profile.targetKind)
    ? profile.targetKind
    : "collection";
  return {
    id: profile.id,
    name: profile.name,
    targetKind,
    targetId: profile.targetId,
    format: profile.format,
    destination: profile.destination,
    updatedAt: profile.updatedAt,
  };
}

function isExportProfileTargetKind(value: unknown): value is ExportProfileTargetKind {
  return typeof value === "string" && VALID_TARGET_KINDS.has(value as ExportProfileTargetKind);
}

function isExportProfileFormat(value: unknown): value is ExportProfileFormat {
  return typeof value === "string" && VALID_FORMATS.has(value as ExportProfileFormat);
}
