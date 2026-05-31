"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";

import {
  createGitHubPrDraftId,
  loadGitHubPrDraftFromDb,
  loadGitHubPrDraftsFromDb,
  saveGitHubPrDraftToDb,
} from "@/lib/db/repositories/github-pr";
import { exportWorkspaceArtifacts } from "@/lib/db/repositories/workspace";
import type { GitHubPrDraft, GitHubPublishResult } from "@/lib/workspace/types";

const execFileAsync = promisify(execFile);

export async function getGitHubPrDrafts() {
  return loadGitHubPrDraftsFromDb();
}

export async function createGitHubPrDraft(input?: {
  title?: string;
  body?: string;
  baseBranch?: string;
  payload?: Record<string, unknown>;
}): Promise<GitHubPrDraft> {
  const now = new Date().toISOString();
  const timestamp = now.replace(/[-:.TZ]/g, "").slice(0, 14);
  const baseBranch = input?.baseBranch ?? "main";
  const branchName = `rozetta/sync-${timestamp}`;
  const draft: GitHubPrDraft = {
    id: createGitHubPrDraftId(),
    branchName,
    baseBranch,
    headBranch: branchName,
    title: input?.title?.trim() || "Sync design tokens from Rozetta",
    body: input?.body?.trim() || defaultPrBody(),
    status: "draft",
    payload: input?.payload ?? {},
    createdAt: now,
    updatedAt: now,
  };
  await saveGitHubPrDraftToDb(draft);
  revalidatePrRoutes();
  return draft;
}

export async function publishGitHubPr(draftId: string): Promise<GitHubPublishResult> {
  const draft = await loadGitHubPrDraftFromDb(draftId);
  if (!draft) return { ok: false, error: `PR draft ${draftId} not found.` };

  try {
    await run("git", ["switch", "-c", draft.branchName]);
  } catch {
    await run("git", ["switch", draft.branchName]);
  }

  await exportWorkspaceArtifacts();

  await run("git", [
    "add",
    "tokens",
    ".rozetta/themes.json",
    ".rozetta/brands.json",
    ".rozetta/components.json",
    ".rozetta/export-profiles.json",
    "specs",
    "README.md",
    "AGENTS.md",
  ]);

  const status = (await run("git", ["status", "--porcelain"])).trim();
  if (!status) {
    const failed = await saveGitHubPrDraftToDb({
      ...draft,
      status: "failed",
      updatedAt: new Date().toISOString(),
      payload: { ...draft.payload, error: "No versioned Rozetta artifacts changed." },
    });
    return { ok: false, draft: failed, error: "No versioned Rozetta artifacts changed." };
  }

  await run("git", ["commit", "-m", draft.title]);
  await run("git", ["push", "-u", "origin", draft.branchName]);
  const url = (await run("gh", [
    "pr",
    "create",
    "--base",
    draft.baseBranch,
    "--head",
    draft.branchName,
    "--title",
    draft.title,
    "--body",
    draft.body,
  ])).trim();

  const published = await saveGitHubPrDraftToDb({
    ...draft,
    status: "published",
    url,
    updatedAt: new Date().toISOString(),
  });
  revalidatePrRoutes();
  return { ok: true, draft: published, url };
}

async function run(command: string, args: string[]) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function defaultPrBody() {
  return [
    "## Summary",
    "- Sync reviewed Rozetta design-system artifacts.",
    "",
    "## Safety",
    "- Generated from reviewed local state.",
    "- Runtime database files are not included.",
  ].join("\n");
}

function revalidatePrRoutes() {
  // PR drafts surface on /sync/figma (publish UI) and /branches (review UI);
  // /ai consumed them defensively but doesn't render them on first paint.
  revalidatePath("/sync/figma");
  revalidatePath("/branches");
}
