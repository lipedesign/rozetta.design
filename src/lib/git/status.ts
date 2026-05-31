import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { parseTokenFile } from "@/lib/dtcg/schema";
import {
  DEFAULT_COLLECTION_MODE_ID,
  DEFAULT_COLLECTION_MODE_NAME,
} from "@/lib/dtcg/collections";
import type { CollectionMode, DtcgGroup, TokenSet } from "@/lib/dtcg/types";
import { normalizeBrands, normalizeComponents } from "@/lib/design-system/registry";
import { normalizeThemes } from "@/lib/themes/registry";
import type { Theme } from "@/lib/themes/types";
import type {
  Brand,
  DesignSystemComponent,
  DesignSystemRegistryInput,
  GitFileKind,
  GitFileStatus,
  GitStatusSummary,
} from "@/lib/workspace/types";

const execFileAsync = promisify(execFile);
const ORIGINAL_SUFFIX = ".tokens.json";
const EDITED_SUFFIX = ".edited.tokens.json";

export async function getGitStatusSummary(): Promise<GitStatusSummary> {
  try {
    await git(["rev-parse", "--is-inside-work-tree"]);
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

  try {
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
      error: err instanceof Error ? err.message : "Unable to read Git status.",
    };
  }
}

export async function loadGitBaselineDesignSystemRegistry(
  ref = "HEAD"
): Promise<DesignSystemRegistryInput> {
  const [themes, brands, components] = await Promise.all([
    readBaselineJson<Theme[]>(ref, ".rozetta/themes.json", normalizeThemes),
    readBaselineJson<Brand[]>(ref, ".rozetta/brands.json", normalizeBrands),
    readBaselineJson<DesignSystemComponent[]>(
      ref,
      ".rozetta/components.json",
      normalizeComponents
    ),
  ]);
  return { themes, brands, components };
}

export async function loadGitBaselineTokenSets(ref = "HEAD"): Promise<TokenSet[]> {
  let files: string[];
  try {
    const output = await git(["ls-tree", "-r", "--name-only", ref, "--", "tokens"]);
    files = output
      .split("\n")
      .filter((file) => file.endsWith(ORIGINAL_SUFFIX) && !file.endsWith(EDITED_SUFFIX));
  } catch {
    return [];
  }

  const legacyFiles = files.filter((file) => path.dirname(file) === "tokens");
  const modeFiles = files.filter((file) => path.dirname(file) !== "tokens");

  const legacySets = await Promise.all(
    legacyFiles.map(async (file) => {
      try {
        const raw = await git(["show", `${ref}:${file}`]);
        const result = parseTokenFile(raw);
        if (!result.ok) return undefined;
        const filename = path.basename(file);
        const id = toId(filename);
        return {
          id,
          name: toDisplayName(id),
          filename,
          root: result.data as DtcgGroup,
        } satisfies TokenSet;
      } catch {
        return undefined;
      }
    })
  );

  const modeCollections = await loadGitBaselineTokenCollectionsFromModeLayout(ref, modeFiles);

  return [...legacySets.filter((set): set is TokenSet => Boolean(set)), ...modeCollections]
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadGitBaselineTokenCollectionsFromModeLayout(
  ref: string,
  files: string[]
): Promise<TokenSet[]> {
  const byCollection = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split("/");
    if (parts.length < 3) continue;
    const collectionId = parts[1]!;
    const current = byCollection.get(collectionId) ?? [];
    current.push(file);
    byCollection.set(collectionId, current);
  }

  const collections: TokenSet[] = [];
  for (const [collectionId, collectionFiles] of byCollection) {
    const modes: CollectionMode[] = [];
    const modeRoots: Record<string, DtcgGroup> = {};
    for (const [position, file] of collectionFiles.sort().entries()) {
      try {
        const raw = await git(["show", `${ref}:${file}`]);
        const result = parseTokenFile(raw);
        if (!result.ok) continue;
        const modeId = toId(path.basename(file));
        modes.push({
          id: modeId,
          name: toDisplayName(modeId),
          isDefault:
            modeId === DEFAULT_COLLECTION_MODE_ID ||
            modeId.toLowerCase() === DEFAULT_COLLECTION_MODE_NAME.toLowerCase() ||
            position === 0,
          position,
        });
        modeRoots[modeId] = result.data as DtcgGroup;
      } catch {
        continue;
      }
    }
    if (modes.length === 0) continue;
    const defaultMode = modes.find((mode) => mode.isDefault) ?? modes[0]!;
    collections.push({
      id: collectionId,
      name: toDisplayName(collectionId),
      filename: `${collectionId}/${defaultMode.id}${ORIGINAL_SUFFIX}`,
      root: modeRoots[defaultMode.id] ?? {},
      modes,
      modeRoots,
      activeModeId: defaultMode.id,
    });
  }

  return collections;
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

function toId(filename: string): string {
  return filename.replace(ORIGINAL_SUFFIX, "").toLowerCase();
}

function toDisplayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
