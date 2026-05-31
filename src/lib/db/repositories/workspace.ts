import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import {
  getActiveCollectionMode,
  getCollectionModeRoot,
  getCollectionModes,
  materializeCollectionMode,
  withCollectionModeRoot,
} from "@/lib/dtcg/collections";
import { flattenTokens } from "@/lib/dtcg/parser";
import { setTokenAtPath } from "@/lib/dtcg/serializer";
import type { CollectionMode, DtcgGroup, DtcgToken, TokenSet } from "@/lib/dtcg/types";
import {
  artifactExports,
  auditEvents,
  organizations,
  themes as dbThemes,
  themeGroups as dbThemeGroups,
  themeSets,
  tokenIndex,
  tokenSets,
  workspaces,
} from "@/lib/db/schema";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_SLUG,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_SLUG,
  getDb,
} from "@/lib/db/runtime";
import {
  loadAllTokenSets,
  writeTokenCollectionModeArtifact,
} from "@/lib/tokens/filesystem";
import { loadThemesFile, writeThemesFile } from "@/lib/themes/filesystem";
import { normalizeThemes } from "@/lib/themes/registry";
import type { Theme, ThemeGroup } from "@/lib/themes/types";
import type { AuditActorType, AuditResourceType, WorkspaceContext } from "@/lib/auth/types";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/lib/auth/workspace-context";

export interface DbWorkspaceState {
  sets: TokenSet[];
  originalRoots: Record<string, DtcgGroup>;
  themes: Theme[];
  originalThemes: Theme[];
  themesFileExists: boolean;
}

export interface ExportWorkspaceArtifactsResult {
  tokenFiles: string[];
  themesFile?: string;
  exportedAt: string;
}

interface DbTokenWorkspaceState {
  sets: TokenSet[];
  originalRoots: Record<string, DtcgGroup>;
}

interface DbThemeWorkspaceState {
  themes: Theme[];
  originalThemes: Theme[];
  themesFileExists: boolean;
}

let defaultWorkspacePromise: Promise<void> | undefined;
const importWorkspacePromises = new Map<string, Promise<void>>();
const importedWorkspaces = new Set<string>();
const tokenSetsCache = new Map<string, TokenSet[]>();
const themesCache = new Map<string, Theme[]>();

export async function getWorkspaceFromDb(context?: WorkspaceContext): Promise<DbWorkspaceState> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const [tokens, themes] = await Promise.all([
    getTokenWorkspaceFromDb(resolvedContext),
    getThemeWorkspaceFromDb(resolvedContext),
  ]);
  return {
    sets: tokens.sets,
    originalRoots: tokens.originalRoots,
    themes: themes.themes,
    originalThemes: themes.originalThemes,
    themesFileExists: themes.themesFileExists,
  };
}

export async function getTokenWorkspaceFromDb(
  context?: WorkspaceContext
): Promise<DbTokenWorkspaceState> {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const [sets, artifactSets] = await Promise.all([
    listTokenSetsFromDb(resolvedContext),
    loadAllTokenSets(),
  ]);
  const originalRoots: Record<string, DtcgGroup> = {};
  for (const set of artifactSets) {
    originalRoots[set.id] = cloneRoot(set.root);
    for (const mode of getCollectionModes(set)) {
      originalRoots[`${set.id}:${mode.id}`] = cloneRoot(getCollectionModeRoot(set, mode.id));
    }
  }
  return { sets, originalRoots };
}

export async function getThemeWorkspaceFromDb(
  context?: WorkspaceContext
): Promise<DbThemeWorkspaceState> {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const [themes, artifactThemes] = await Promise.all([
    listThemesFromDb(resolvedContext),
    loadThemesFile(),
  ]);
  return {
    themes,
    originalThemes: artifactThemes.themes,
    themesFileExists: artifactThemes.exists,
  };
}

export async function ensureWorkspaceImportedFromFiles(
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  if (importedWorkspaces.has(resolvedContext.workspaceId)) return;
  const existingPromise = importWorkspacePromises.get(resolvedContext.workspaceId);
  if (existingPromise) {
    await existingPromise;
    return;
  }
  const promise = importWorkspaceFromFiles(resolvedContext).then(
    () => {
      importedWorkspaces.add(resolvedContext.workspaceId);
      importWorkspacePromises.delete(resolvedContext.workspaceId);
    },
    (error) => {
      importWorkspacePromises.delete(resolvedContext.workspaceId);
      throw error;
    }
  );
  importWorkspacePromises.set(resolvedContext.workspaceId, promise);
  await promise;
}

async function importWorkspaceFromFiles(context: WorkspaceContext): Promise<void> {
  await ensureWorkspaceExists(context);
  const db = getDb();
  const [tokenCount, themeCount] = await Promise.all([
    db
      .select({ value: count() })
      .from(tokenSets)
      .where(eq(tokenSets.workspaceId, context.workspaceId))
      .limit(1)
      .then((rows) => rows[0]?.value ?? 0),
    db
      .select({ value: count() })
      .from(dbThemes)
      .where(eq(dbThemes.workspaceId, context.workspaceId))
      .limit(1)
      .then((rows) => rows[0]?.value ?? 0),
  ]);

  const [sets, file] = await Promise.all([
    tokenCount === 0 ? loadAllTokenSets() : Promise.resolve([]),
    themeCount === 0 ? loadThemesFile() : Promise.resolve({ exists: false, themes: [] }),
  ]);

  for (const set of sets) {
    await upsertTokenSetInDb(set, { source: "filesystem-import", audit: false }, context);
  }
  if (sets.length > 0) {
    await saveAuditEvent(context, "workspace.import.tokens", `Imported ${sets.length} token collections from filesystem`, {
      collectionIds: sets.map((set) => set.id),
    }, { resourceType: "workspace", resourceId: context.workspaceId, actorType: "system" });
  }

  if (file.themes.length > 0) {
    await replaceThemesInDb(file.themes, { audit: false }, context);
    await saveAuditEvent(context, "workspace.import.themes", `Imported ${file.themes.length} themes from filesystem`, {
      themeIds: file.themes.map((theme) => theme.id),
    }, { resourceType: "workspace", resourceId: context.workspaceId, actorType: "system" });
  }
}

export async function listTokenSetsFromDb(
  context?: WorkspaceContext
): Promise<TokenSet[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const cached = tokenSetsCache.get(resolvedContext.workspaceId);
  if (cached) return cloneTokenSets(cached);
  const rows = await getDb()
    .select()
    .from(tokenSets)
    .where(eq(tokenSets.workspaceId, resolvedContext.workspaceId))
    .orderBy(asc(tokenSets.name));
  const sets = rows.map((row) => ({
    id: fromDbScopedId(resolvedContext, row.id),
    name: row.name,
    filename: row.filename,
    root: JSON.parse(row.root) as DtcgGroup,
    modes: parseJson<CollectionMode[]>(row.modes) ?? undefined,
    modeRoots: parseJson<Record<string, DtcgGroup>>(row.modeRoots) ?? undefined,
    activeModeId: row.activeModeId ?? undefined,
  }));
  tokenSetsCache.set(resolvedContext.workspaceId, sets);
  return cloneTokenSets(sets);
}

export async function upsertTokenSetInDb(
  set: TokenSet,
  options: { source?: string; audit?: boolean } = {},
  context?: WorkspaceContext
): Promise<TokenSet> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(tokenSets)
    .values({
      id: toDbScopedId(resolvedContext, set.id),
      workspaceId: resolvedContext.workspaceId,
      name: set.name,
      filename: set.filename,
      root: JSON.stringify(set.root),
      modes: set.modes ? JSON.stringify(set.modes) : undefined,
      modeRoots: set.modeRoots ? JSON.stringify(set.modeRoots) : undefined,
      activeModeId: set.activeModeId,
      source: options.source ?? "ui",
      createdBy: resolvedContext.userId,
      updatedBy: resolvedContext.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tokenSets.id,
      set: {
        name: set.name,
        filename: set.filename,
        root: JSON.stringify(set.root),
        modes: set.modes ? JSON.stringify(set.modes) : undefined,
        modeRoots: set.modeRoots ? JSON.stringify(set.modeRoots) : undefined,
        activeModeId: set.activeModeId,
        source: options.source ?? "ui",
        updatedBy: resolvedContext.userId,
        updatedAt: now,
      },
    });
  await reindexTokenSet(set, now, resolvedContext);
  invalidateWorkspaceReadCache(resolvedContext, { tokens: true });
  if (options.audit !== false) {
    await saveAuditEvent(resolvedContext, "token-collection.upsert", `Updated token collection ${set.name}`, {
      collectionId: set.id,
    }, {
      actorType: "user",
      resourceType: "token-collection",
      resourceId: set.id,
    });
  }
  return set;
}

export async function patchTokenInDb(
  setId: string,
  path: string,
  patch: {
    $value?: DtcgToken["$value"];
    $type?: DtcgToken["$type"];
    $description?: string;
    $extensions?: Record<string, unknown>;
  }
): Promise<TokenSet | undefined> {
  const context = await getWorkspaceContext();
  requireWorkspaceRole(context, "editor");
  const set = (await listTokenSetsFromDb(context)).find((item) => item.id === setId);
  if (!set) return undefined;
  const activeMode = getActiveCollectionMode(set);
  const activeRoot = getCollectionModeRoot(set, activeMode.id);
  const nextRoot = setTokenAtPath(activeRoot, path, patch);
  const next: TokenSet = {
    ...withCollectionModeRoot(set, activeMode.id, nextRoot),
    activeModeId: activeMode.id,
  };
  await upsertTokenSetInDb(next, {}, context);
  return next;
}

export async function deleteTokenSetFromDb(
  setId: string,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const db = getDb();
  const dbSetId = toDbScopedId(resolvedContext, setId);
  await db.delete(tokenIndex).where(and(eq(tokenIndex.workspaceId, resolvedContext.workspaceId), eq(tokenIndex.setId, dbSetId)));
  await db.delete(tokenSets).where(and(eq(tokenSets.workspaceId, resolvedContext.workspaceId), eq(tokenSets.id, dbSetId)));
  invalidateWorkspaceReadCache(resolvedContext, { tokens: true });
  await saveAuditEvent(resolvedContext, "token-collection.delete", `Deleted token collection ${setId}`, {
    collectionId: setId,
  }, {
    actorType: "user",
    resourceType: "token-collection",
    resourceId: setId,
  });
}

export async function listThemesFromDb(
  context?: WorkspaceContext
): Promise<Theme[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const cached = themesCache.get(resolvedContext.workspaceId);
  if (cached) return cloneThemes(cached);
  const db = getDb();
  const themeRows = await db
    .select()
    .from(dbThemes)
    .where(eq(dbThemes.workspaceId, resolvedContext.workspaceId))
    .orderBy(asc(dbThemes.name));
  const setRows = await db
    .select()
    .from(themeSets)
    .where(eq(themeSets.workspaceId, resolvedContext.workspaceId))
    .orderBy(asc(themeSets.themeId), asc(themeSets.position));
  const setsByTheme = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const rows = setsByTheme.get(row.themeId) ?? [];
    rows.push(row);
    setsByTheme.set(row.themeId, rows);
  }
  const themes = normalizeThemes(
    themeRows.map((theme) => ({
      id: fromDbScopedId(resolvedContext, theme.id),
      themeGroupId: theme.themeGroupId
        ? fromDbScopedId(resolvedContext, theme.themeGroupId)
        : undefined,
      name: theme.name,
      description: theme.description ?? undefined,
      position: theme.position,
      updatedAt: theme.updatedAt,
      sets: (setsByTheme.get(theme.id) ?? []).map((ref) => ({
        setId: ref.setId,
        collectionId: ref.setId,
        modeId: ref.modeId,
        mode: ref.mode,
        state: ref.mode,
      })),
    }))
  );
  themesCache.set(resolvedContext.workspaceId, themes);
  return cloneThemes(themes);
}

export async function upsertThemeInDb(
  theme: Theme,
  options: { audit?: boolean } = {},
  context?: WorkspaceContext
): Promise<Theme> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const db = getDb();
  const now = new Date().toISOString();
  const dbThemeId = toDbScopedId(resolvedContext, theme.id);
  const themeGroupScopedId = theme.themeGroupId
    ? toDbScopedId(resolvedContext, theme.themeGroupId)
    : null;
  await db.insert(dbThemes)
    .values({
      id: dbThemeId,
      workspaceId: resolvedContext.workspaceId,
      themeGroupId: themeGroupScopedId,
      name: theme.name,
      description: theme.description,
      position: theme.position ?? 0,
      createdBy: resolvedContext.userId,
      updatedBy: resolvedContext.userId,
      updatedAt: theme.updatedAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: dbThemes.id,
      set: {
        themeGroupId: themeGroupScopedId,
        name: theme.name,
        description: theme.description,
        position: theme.position ?? 0,
        updatedBy: resolvedContext.userId,
        updatedAt: theme.updatedAt,
      },
    });

  await db.delete(themeSets).where(eq(themeSets.themeId, dbThemeId));
  for (const [index, ref] of theme.sets.entries()) {
    const collectionId = ref.collectionId ?? ref.setId;
    const modeId = ref.modeId ?? "default";
    const state = ref.state ?? ref.mode;
    await db.insert(themeSets)
      .values({
        id: `theme-set:${dbThemeId}:${collectionId}:${modeId}`,
        workspaceId: resolvedContext.workspaceId,
        themeId: dbThemeId,
        setId: collectionId,
        modeId,
        mode: state,
        position: index,
      })
      .onConflictDoUpdate({
        target: themeSets.id,
        set: {
          modeId,
          mode: state,
          position: index,
        },
      });
  }
  if (options.audit !== false) {
    await saveAuditEvent(resolvedContext, "theme.upsert", `Updated theme ${theme.name}`, { themeId: theme.id }, {
      actorType: "user",
      resourceType: "theme",
      resourceId: theme.id,
    });
  }
  invalidateWorkspaceReadCache(resolvedContext, { themes: true });
  return theme;
}

export async function replaceThemesInDb(
  themes: Theme[],
  options: { audit?: boolean } = {},
  context?: WorkspaceContext
): Promise<Theme[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const db = getDb();
  await db.delete(themeSets).where(eq(themeSets.workspaceId, resolvedContext.workspaceId));
  await db.delete(dbThemes).where(eq(dbThemes.workspaceId, resolvedContext.workspaceId));
  const normalized = normalizeThemes(themes);
  for (const theme of normalized) {
    await upsertThemeInDb(theme, { audit: options.audit }, resolvedContext);
  }
  if (options.audit !== false) {
    await saveAuditEvent(resolvedContext, "themes.replace", `Replaced ${normalized.length} themes`, {
      themeIds: normalized.map((theme) => theme.id),
    }, { actorType: "user", resourceType: "theme" });
  }
  invalidateWorkspaceReadCache(resolvedContext, { themes: true });
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────
// Theme Groups (Tokens Studio model: Workspace → Theme Groups → Themes →
// Collection/Mode refs). Theme Groups are user-authored containers; the
// system never auto-creates them.
// ─────────────────────────────────────────────────────────────────────────

export async function listThemeGroupsFromDb(
  context?: WorkspaceContext
): Promise<ThemeGroup[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const rows = await getDb()
    .select()
    .from(dbThemeGroups)
    .where(eq(dbThemeGroups.workspaceId, resolvedContext.workspaceId))
    .orderBy(asc(dbThemeGroups.position), asc(dbThemeGroups.createdAt));
  return rows.map((row) => ({
    id: fromDbScopedId(resolvedContext, row.id),
    name: row.name,
    description: row.description ?? undefined,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createThemeGroupInDb(
  input: { name: string; description?: string },
  context?: WorkspaceContext
): Promise<ThemeGroup> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const now = new Date().toISOString();
  const id = `theme-group:${randomUUID()}`;
  const scopedId = toDbScopedId(resolvedContext, id);
  const existing = await listThemeGroupsFromDb(resolvedContext);
  const position = existing.length > 0
    ? Math.max(...existing.map((group) => group.position)) + 1
    : 0;
  await getDb().insert(dbThemeGroups).values({
    id: scopedId,
    workspaceId: resolvedContext.workspaceId,
    name: input.name,
    description: input.description,
    position,
    createdAt: now,
    updatedAt: now,
  });
  await saveAuditEvent(
    resolvedContext,
    "theme-group.create",
    `Created theme group ${input.name}`,
    { themeGroupId: id },
    { actorType: "user", resourceType: "theme", resourceId: id }
  );
  return {
    id,
    name: input.name,
    description: input.description,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateThemeGroupInDb(
  themeGroupId: string,
  patch: Partial<Pick<ThemeGroup, "name" | "description">>,
  context?: WorkspaceContext
): Promise<ThemeGroup | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const scopedId = toDbScopedId(resolvedContext, themeGroupId);
  const now = new Date().toISOString();
  await getDb()
    .update(dbThemeGroups)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(dbThemeGroups.id, scopedId),
        eq(dbThemeGroups.workspaceId, resolvedContext.workspaceId)
      )
    );
  const rows = await getDb()
    .select()
    .from(dbThemeGroups)
    .where(eq(dbThemeGroups.id, scopedId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: fromDbScopedId(resolvedContext, row.id),
    name: row.name,
    description: row.description ?? undefined,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteThemeGroupFromDb(
  themeGroupId: string,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const scopedId = toDbScopedId(resolvedContext, themeGroupId);
  const db = getDb();
  // Cascade by hand because we don't have a FK from themes.theme_group_id
  // (it stays nullable so legacy themes without a group are still readable).
  const childThemes = await db
    .select({ id: dbThemes.id })
    .from(dbThemes)
    .where(eq(dbThemes.themeGroupId, scopedId));
  if (childThemes.length > 0) {
    const childIds = childThemes.map((row) => row.id);
    await db.delete(themeSets).where(
      and(
        eq(themeSets.workspaceId, resolvedContext.workspaceId),
        inArray(themeSets.themeId, childIds)
      )
    );
    await db.delete(dbThemes).where(
      and(
        eq(dbThemes.workspaceId, resolvedContext.workspaceId),
        inArray(dbThemes.id, childIds)
      )
    );
  }
  await db
    .delete(dbThemeGroups)
    .where(
      and(
        eq(dbThemeGroups.id, scopedId),
        eq(dbThemeGroups.workspaceId, resolvedContext.workspaceId)
      )
    );
  invalidateWorkspaceReadCache(resolvedContext, { themes: true });
  await saveAuditEvent(
    resolvedContext,
    "theme-group.delete",
    `Deleted theme group ${themeGroupId}`,
    { themeGroupId },
    { actorType: "user", resourceType: "theme", resourceId: themeGroupId }
  );
}

/**
 * Returns the most recently updated Theme for the workspace, or `undefined` if
 * none exist. Themes are user-authored compositions (Tokens Studio model);
 * this entry point intentionally does NOT auto-create one.
 *
 * The full Theme Groups → Themes hierarchy is `planned` (see
 * `specs/features/themes.md`). This helper is kept narrow until the model
 * lands so we don't grow legacy auto-create code that has to be undone later.
 */
export async function getWorkspaceTheme(
  context?: WorkspaceContext
): Promise<Theme | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const existing = await listThemesFromDb(resolvedContext);
  if (existing.length === 0) return undefined;
  return [...existing].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
}

export async function deleteThemeFromDb(
  themeId: string,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceExists(resolvedContext);
  const db = getDb();
  const dbThemeId = toDbScopedId(resolvedContext, themeId);
  await db.delete(themeSets).where(and(eq(themeSets.workspaceId, resolvedContext.workspaceId), eq(themeSets.themeId, dbThemeId)));
  await db.delete(dbThemes).where(and(eq(dbThemes.workspaceId, resolvedContext.workspaceId), eq(dbThemes.id, dbThemeId)));
  invalidateWorkspaceReadCache(resolvedContext, { themes: true });
  await saveAuditEvent(resolvedContext, "theme.delete", `Deleted theme ${themeId}`, { themeId }, {
    actorType: "user",
    resourceType: "theme",
    resourceId: themeId,
  });
}

export async function exportWorkspaceArtifacts(
  context?: WorkspaceContext
): Promise<ExportWorkspaceArtifactsResult> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const exportedAt = new Date().toISOString();
  const [sets, themes] = await Promise.all([listTokenSetsFromDb(resolvedContext), listThemesFromDb(resolvedContext)]);
  const tokenFiles: string[] = [];
  for (const set of sets) {
    for (const mode of getCollectionModes(set)) {
      const modeSet = materializeCollectionMode(set, mode.id);
      const path = await writeTokenCollectionModeArtifact(set.id, mode.id, modeSet.root);
      tokenFiles.push(path);
      await saveArtifactExport(
        resolvedContext,
        "token-collection-mode",
        `${set.id}:${mode.id}`,
        path,
        modeSet.root,
        exportedAt
      );
    }
  }
  const themesFile = await writeThemesFile(themes);
  await saveArtifactExport(resolvedContext, "themes", null, themesFile, themes, exportedAt);
  await saveAuditEvent(resolvedContext, "workspace.export-artifacts", "Exported DB workspace to Git-native artifacts", {
    collectionIds: sets.map((set) => set.id),
    themeIds: themes.map((theme) => theme.id),
  }, { actorType: "user", resourceType: "workspace", resourceId: resolvedContext.workspaceId });
  invalidateWorkspaceReadCache(resolvedContext);
  return { tokenFiles, themesFile, exportedAt };
}

export async function getLatestArtifactExports(limit = 20, context?: WorkspaceContext) {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceExists(resolvedContext);
  return await getDb()
    .select()
    .from(artifactExports)
    .where(eq(artifactExports.workspaceId, resolvedContext.workspaceId))
    .orderBy(desc(artifactExports.createdAt))
    .limit(limit);
}

async function ensureWorkspaceExists(context: WorkspaceContext): Promise<void> {
  if (context.source !== "dev" && context.source !== "test") return;
  await ensureDefaultWorkspace();
}

async function resolveWorkspaceContext(context?: WorkspaceContext) {
  return context ?? (await getWorkspaceContext());
}

async function ensureDefaultWorkspace(): Promise<void> {
  defaultWorkspacePromise ??= writeDefaultWorkspace().catch((error) => {
    defaultWorkspacePromise = undefined;
    throw error;
  });
  await defaultWorkspacePromise;
}

async function writeDefaultWorkspace(): Promise<void> {
  const now = new Date().toISOString();
  const db = getDb();
  await db
    .insert(organizations)
    .values({
      id: DEFAULT_ORGANIZATION_ID,
      name: "Local organization",
      slug: DEFAULT_ORGANIZATION_SLUG,
      createdBy: "dev-user",
      updatedBy: "dev-user",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: { updatedAt: now },
    });
  await db
    .insert(workspaces)
    .values({
      id: DEFAULT_WORKSPACE_ID,
      organizationId: DEFAULT_ORGANIZATION_ID,
      name: "Local workspace",
      slug: DEFAULT_WORKSPACE_SLUG,
      createdBy: "dev-user",
      updatedBy: "dev-user",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: { updatedAt: now },
    });
}

export function invalidateWorkspaceReadCache(
  context?: WorkspaceContext,
  scope: { tokens?: boolean; themes?: boolean } = {}
) {
  const workspaceId = context?.workspaceId;
  if (scope.tokens !== false) {
    if (workspaceId) tokenSetsCache.delete(workspaceId);
    else tokenSetsCache.clear();
  }
  if (scope.themes !== false) {
    if (workspaceId) themesCache.delete(workspaceId);
    else themesCache.clear();
  }
}

async function reindexTokenSet(
  set: TokenSet,
  updatedAt: string,
  context: WorkspaceContext
): Promise<void> {
  const db = getDb();
  const dbSetId = toDbScopedId(context, set.id);
  await db.delete(tokenIndex)
    .where(and(eq(tokenIndex.workspaceId, context.workspaceId), eq(tokenIndex.setId, dbSetId)));
  const rows: (typeof tokenIndex.$inferInsert)[] = [];
  for (const mode of getCollectionModes(set)) {
    const modeSet = materializeCollectionMode(set, mode.id);
    for (const token of flattenTokens(modeSet)) {
      rows.push({
        id: `token-index:${dbSetId}:${mode.id}:${token.path}`,
        workspaceId: context.workspaceId,
        setId: dbSetId,
        modeId: mode.id,
        path: token.path,
        name: token.name,
        type: token.$type,
        value: JSON.stringify(token.$value),
        description: token.$description,
        isAlias: token.isAlias,
        updatedAt,
      });
    }
  }
  if (rows.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(tokenIndex).values(rows.slice(i, i + BATCH));
  }
}

async function saveArtifactExport(
  context: WorkspaceContext,
  kind: string,
  targetId: string | null,
  filePath: string,
  payload: unknown,
  createdAt: string
): Promise<void> {
  await getDb()
    .insert(artifactExports)
    .values({
      id: `artifact-export:${randomUUID()}`,
      workspaceId: context.workspaceId,
      kind,
      targetId,
      path: filePath,
      checksum: checksum(payload),
      createdAt,
    });
}

async function saveAuditEvent(
  context: WorkspaceContext,
  kind: string,
  summary: string,
  payload: Record<string, unknown>,
  meta: {
    actorType?: AuditActorType;
    resourceType?: AuditResourceType;
    resourceId?: string;
  } = {}
): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .insert(auditEvents)
    .values({
      id: `audit:${randomUUID()}`,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorType: meta.actorType ?? (context.source === "supabase" ? "user" : "system"),
      actorId: context.userId,
      resourceType: meta.resourceType,
      resourceId: meta.resourceId,
      kind,
      summary,
      payload: JSON.stringify(payload),
      createdAt: now,
    });
}

function cloneRoot(root: DtcgGroup): DtcgGroup {
  return JSON.parse(JSON.stringify(root)) as DtcgGroup;
}

function cloneTokenSets(sets: TokenSet[]): TokenSet[] {
  return sets.map((set) => ({
    ...set,
    root: cloneRoot(set.root),
    modes: set.modes ? JSON.parse(JSON.stringify(set.modes)) as CollectionMode[] : undefined,
    modeRoots: set.modeRoots
      ? JSON.parse(JSON.stringify(set.modeRoots)) as Record<string, DtcgGroup>
      : undefined,
  }));
}

function cloneThemes(themes: Theme[]): Theme[] {
  return JSON.parse(JSON.stringify(themes)) as Theme[];
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function toDbScopedId(context: WorkspaceContext, id: string): string {
  if (context.workspaceId === DEFAULT_WORKSPACE_ID) return id;
  return `${context.workspaceId}:${id}`;
}

function fromDbScopedId(context: WorkspaceContext, id: string): string {
  const prefix = `${context.workspaceId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}
