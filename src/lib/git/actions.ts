"use server";

import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";

const execFileAsync = promisify(execFile);

/**
 * Git mutation Server Actions for `/branches`. Mirror the pattern in
 * `lib/github/actions.ts`: `execFile` (no shell, no injection), allowlisted
 * binary (`git` only), discriminated results, branch-name validation. The
 * actions revalidate `/branches` so the page picks up the new state.
 *
 * Per architecture §1: server-only, disabled in hosted Vercel runtime.
 */

const BRANCH_NAME_RE = /^(?!\.)(?!.*\.{2})[A-Za-z0-9._\/-]{1,200}$/;

export interface LocalBranch {
  name: string;
  isCurrent: boolean;
}

export type LocalBranchListResult =
  | { ok: true; branches: LocalBranch[] }
  | { ok: false; error: string };

export type BranchMutationResult =
  | { ok: true; branch: string }
  | { ok: false; error: string };

export async function listLocalBranches(): Promise<LocalBranchListResult> {
  if (!isLocalRuntime()) {
    return { ok: false, error: "Git mutations are disabled in hosted runtime." };
  }
  try {
    const stdout = await run("git", [
      "for-each-ref",
      "--format=%(HEAD)%(refname:short)",
      "refs/heads",
    ]);
    const branches = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        isCurrent: line.startsWith("*"),
        name: line.replace(/^\*?\s?/, ""),
      }))
      .filter((branch) => branch.name.length > 0);
    return { ok: true, branches };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function createGitBranch(name: string): Promise<BranchMutationResult> {
  if (!isLocalRuntime()) {
    return { ok: false, error: "Git mutations are disabled in hosted runtime." };
  }
  const trimmed = name.trim();
  if (!BRANCH_NAME_RE.test(trimmed)) {
    return { ok: false, error: "Invalid branch name." };
  }
  try {
    await run("git", ["switch", "-c", trimmed]);
    revalidatePath("/branches");
    return { ok: true, branch: trimmed };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function switchGitBranch(name: string): Promise<BranchMutationResult> {
  if (!isLocalRuntime()) {
    return { ok: false, error: "Git mutations are disabled in hosted runtime." };
  }
  const trimmed = name.trim();
  if (!BRANCH_NAME_RE.test(trimmed)) {
    return { ok: false, error: "Invalid branch name." };
  }
  try {
    await run("git", ["switch", trimmed]);
    revalidatePath("/branches");
    revalidatePath("/", "layout");
    return { ok: true, branch: trimmed };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

function isLocalRuntime(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.NEXT_RUNTIME === "edge") return false;
  return true;
}

async function run(command: "git", args: string[]) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function messageOf(err: unknown) {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = (err as { stderr?: string }).stderr;
    if (typeof stderr === "string" && stderr.trim()) {
      return stderr.split("\n")[0]!.trim();
    }
  }
  return err instanceof Error ? err.message : "Unknown git error.";
}
