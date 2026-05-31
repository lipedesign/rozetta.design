import type { Theme, ThemeSetMode } from "./types";

const MODES: ThemeSetMode[] = ["enabled", "source", "disabled"];

export function normalizeThemes(value: unknown): Theme[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isThemeLike)
    .map((theme) => ({
      ...theme,
      sets: theme.sets
        .filter((ref) => typeof ref.setId === "string")
        .map((ref) => ({
          collectionId: ref.collectionId ?? ref.setId,
          setId: ref.setId,
          modeId: ref.modeId,
          state: MODES.includes(ref.state ?? ref.mode) ? (ref.state ?? ref.mode) : "enabled",
          mode: MODES.includes(ref.mode) ? ref.mode : "enabled",
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createThemeDraft(themes: Theme[], name: string, description?: string): Theme {
  const id = uniqueId(themes, slug(name));
  return {
    id,
    name,
    description,
    sets: [],
    updatedAt: new Date().toISOString(),
  };
}

function isThemeLike(value: unknown): value is Theme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.id === "string" &&
    typeof theme.name === "string" &&
    Array.isArray(theme.sets) &&
    typeof theme.updatedAt === "string"
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "theme"
  );
}

function uniqueId(themes: Theme[], base: string): string {
  let id = base;
  let n = 2;
  while (themes.some((theme) => theme.id === id)) id = `${base}-${n++}`;
  return id;
}
