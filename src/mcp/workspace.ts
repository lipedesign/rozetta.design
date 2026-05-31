import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { desc, eq } from "drizzle-orm";

import type { TokenSet } from "@/lib/dtcg/types";
import { loadAllTokenSets } from "@/lib/tokens/filesystem";
import { loadGitBaselineTokenSets } from "@/lib/git/status";
import { DEFAULT_WORKSPACE_ID, getDb } from "@/lib/db/runtime";
import {
  figmaFiles,
  figmaSnapshots,
  figmaVariableBindings,
  githubPrDrafts,
  syncOperations,
  syncRuns,
} from "@/lib/db/schema";
import { normalizeBrands, normalizeComponents } from "@/lib/design-system/registry";
import { normalizeExportProfiles } from "@/lib/workspace/export-profiles";
import { normalizeThemes } from "@/lib/themes/registry";
import type { Theme } from "@/lib/themes/types";
import type {
  Brand,
  DesignSystemComponent,
  DesignSystemRegistryInput,
  ExportProfile,
  FigmaBridgeState,
  FigmaFileSnapshot,
  FigmaVariableBinding,
  GitFileKind,
  GitFileStatus,
  GitStatusSummary,
  GitHubPrDraft,
  SyncOperation,
  SyncRun,
} from "@/lib/workspace/types";

const execFileAsync = promisify(execFile);
const ROZETTA_DIR = path.join(process.cwd(), ".rozetta");
const THEMES_PATH = path.join(ROZETTA_DIR, "themes.json");
const BRANDS_PATH = path.join(ROZETTA_DIR, "brands.json");
const COMPONENTS_PATH = path.join(ROZETTA_DIR, "components.json");
const EXPORT_PROFILES_PATH = path.join(ROZETTA_DIR, "export-profiles.json");
const AI_PATCHES_PATH = path.join(ROZETTA_DIR, "ai-patches.json");

export async function loadWorkspaceTokenSets(): Promise<TokenSet[]> {
  return loadAllTokenSets();
}

export async function loadWorkspaceThemes(): Promise<Theme[]> {
  try {
    const raw = await fs.readFile(THEMES_PATH, "utf-8");
    return normalizeThemes(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadWorkspaceBrands(): Promise<Brand[]> {
  try {
    const raw = await fs.readFile(BRANDS_PATH, "utf-8");
    return normalizeBrands(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadWorkspaceComponents(): Promise<DesignSystemComponent[]> {
  try {
    const raw = await fs.readFile(COMPONENTS_PATH, "utf-8");
    return normalizeComponents(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadWorkspaceExportProfiles(): Promise<ExportProfile[]> {
  try {
    const raw = await fs.readFile(EXPORT_PROFILES_PATH, "utf-8");
    return normalizeExportProfiles(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadWorkspaceAiPatches(): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(AI_PATCHES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadFigmaBridgeStateForMcp(): Promise<FigmaBridgeState> {
  try {
    const latestFile = await getDb()
      .select()
      .from(figmaFiles)
      .where(eq(figmaFiles.workspaceId, DEFAULT_WORKSPACE_ID))
      .orderBy(desc(figmaFiles.lastSeenAt))
      .limit(1)
      .then((rows) => rows[0]);

    if (!latestFile) {
      return { bindings: [], recentSyncRuns: [] };
    }

    const [snapshotRow, bindingRows, syncRunRows] = await Promise.all([
      getDb()
        .select()
        .from(figmaSnapshots)
        .where(eq(figmaSnapshots.fileId, latestFile.id))
        .orderBy(desc(figmaSnapshots.createdAt))
        .limit(1)
        .then((rows) => rows[0]),
      getDb()
        .select()
        .from(figmaVariableBindings)
        .where(eq(figmaVariableBindings.figmaFileId, latestFile.id)),
      getDb()
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.workspaceId, DEFAULT_WORKSPACE_ID))
        .orderBy(desc(syncRuns.createdAt))
        .limit(5),
    ]);

    const operationRows = syncRunRows.length
      ? await Promise.all(
          syncRunRows.map((run) =>
            getDb().select().from(syncOperations).where(eq(syncOperations.runId, run.id))
          )
        )
      : [];
    const operationsByRun = new Map(
      syncRunRows.map((run, index) => [
        run.id,
        (operationRows[index] ?? []).map((operation) => ({
          id: operation.id,
          runId: operation.runId,
          kind: operation.kind as SyncOperation["kind"],
          status: operation.status as SyncOperation["status"],
          targetKind: operation.targetKind as SyncOperation["targetKind"],
          targetId: operation.targetId,
          summary: operation.summary,
          payload: parseJson<Record<string, unknown>>(operation.payload, {}),
          createdAt: operation.createdAt,
        })),
      ])
    );

    const latestSnapshot = snapshotRow
      ? parseJson<FigmaFileSnapshot | undefined>(snapshotRow.payload, undefined)
      : undefined;
    const recentSyncRuns = syncRunRows.map((run) => ({
      id: run.id,
      connectorId: run.connectorId,
      direction: run.direction as SyncRun["direction"],
      status: run.status as SyncRun["status"],
      sourceSnapshotId: run.sourceSnapshotId ?? undefined,
      summary: run.summary,
      operations: operationsByRun.get(run.id) ?? [],
      createdAt: run.createdAt,
      completedAt: run.completedAt ?? undefined,
    }));

    return {
      fileId: latestFile.fileKey,
      latestSnapshot,
      bindings: bindingRows.map((row) => {
        const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
        return {
          id: row.id,
          figmaFileId: row.figmaFileId,
          variableId: row.variableId,
          collectionId: row.collectionId,
          modeId: row.modeId ?? undefined,
          rozettaCollectionId:
            typeof metadata.rozettaCollectionId === "string" ? metadata.rozettaCollectionId : undefined,
          rozettaModeId: typeof metadata.rozettaModeId === "string" ? metadata.rozettaModeId : undefined,
          setId: row.setId,
          tokenPath: row.tokenPath,
          metadata,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastSyncedAt: row.lastSyncedAt,
        } satisfies FigmaVariableBinding;
      }),
      lastSyncRun: recentSyncRuns[0],
      recentSyncRuns,
    };
  } catch {
    return { bindings: [], recentSyncRuns: [] };
  }
}

export async function loadGitHubPrDraftsForMcp(limit = 10): Promise<GitHubPrDraft[]> {
  try {
    const rows = await getDb()
      .select()
      .from(githubPrDrafts)
      .where(eq(githubPrDrafts.workspaceId, DEFAULT_WORKSPACE_ID))
      .orderBy(desc(githubPrDrafts.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      branchName: row.branchName,
      baseBranch: row.baseBranch,
      headBranch: row.headBranch,
      title: row.title,
      body: row.body,
      status: row.status as GitHubPrDraft["status"],
      url: row.url ?? undefined,
      payload: parseJson<Record<string, unknown>>(row.payload, {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  } catch {
    return [];
  }
}

export async function loadGitStatusSummaryForMcp(): Promise<GitStatusSummary> {
  try {
    await git(["rev-parse", "--is-inside-work-tree"]);
    const branch = (await git(["branch", "--show-current"])).trim() || "detached";
    const statusOutput = await git(["status", "--porcelain=v1", "--branch"]);
    const lines = statusOutput.split("\n").filter(Boolean);
    const branchLine = lines.find((line) => line.startsWith("## ")) ?? "";
    const files = lines
      .filter((line) => !line.startsWith("## "))
      .map(parseStatusLine)
      .filter((file): file is GitFileStatus => Boolean(file));
    return {
      available: true,
      branch,
      ...parseAheadBehind(branchLine),
      clean: files.length === 0,
      files,
      tokenFiles: files.filter((file) => file.path.startsWith("tokens/")),
      designSystemFiles: files.filter((file) => file.path.startsWith(".rozetta/")),
    };
  } catch (err) {
    return {
      available: false,
      branch: "unknown",
      ahead: 0,
      behind: 0,
      clean: true,
      files: [],
      tokenFiles: [],
      designSystemFiles: [],
      error: err instanceof Error ? err.message : "Git repository not available.",
    };
  }
}

export async function loadGitBaselineDesignSystemRegistryForMcp(
  ref = "HEAD"
): Promise<DesignSystemRegistryInput> {
  const [themes, brands, components] = await Promise.all([
    readBaselineJson(ref, ".rozetta/themes.json", normalizeThemes),
    readBaselineJson(ref, ".rozetta/brands.json", normalizeBrands),
    readBaselineJson(ref, ".rozetta/components.json", normalizeComponents),
  ]);
  return { themes, brands, components };
}

export async function loadGitBaselineTokenSetsForMcp(ref = "HEAD"): Promise<TokenSet[]> {
  return loadGitBaselineTokenSets(ref);
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout;
}

async function readBaselineJson<T>(
  ref: string,
  filePath: string,
  normalize: (value: unknown) => T
): Promise<T> {
  try {
    const raw = await git(["show", `${ref}:${filePath}`]);
    return normalize(JSON.parse(raw));
  } catch {
    return normalize([]);
  }
}

function parseStatusLine(line: string): GitFileStatus | undefined {
  if (line.length < 4) return undefined;
  const indexStatus = line[0] ?? " ";
  const worktreeStatus = line[1] ?? " ";
  const rawPath = line.slice(3);
  const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)! : rawPath;
  return {
    path: filePath,
    indexStatus,
    worktreeStatus,
    kind: statusKind(indexStatus, worktreeStatus),
  };
}

function statusKind(indexStatus: string, worktreeStatus: string): GitFileKind {
  const pair = `${indexStatus}${worktreeStatus}`;
  if (pair === "??") return "untracked";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus === "R" || worktreeStatus === "R") return "renamed";
  if (indexStatus === "M" || worktreeStatus === "M") return "modified";
  return "unknown";
}

function parseAheadBehind(line: string): { ahead: number; behind: number } {
  const ahead = Number(line.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(line.match(/behind (\d+)/)?.[1] ?? 0);
  return { ahead, behind };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
