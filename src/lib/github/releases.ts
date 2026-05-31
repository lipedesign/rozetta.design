"use server";

import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/**
 * GitHub Releases Server Actions for `/releases`.
 *
 * Mirrors the safety pattern used in `lib/git/actions.ts` and the existing
 * `lib/github/actions.ts`: `execFile` (no shell, no injection), allowlisted
 * binary (`gh` only), discriminated results, semver-ish tag validation, and
 * a runtime guard so the bridge is disabled on Vercel / Edge.
 *
 * Per architecture §1 and §7: server-only, allowed binaries are exactly `git`
 * and `gh`; this module touches only `gh`. The release body is written to a
 * short-lived temp file under the OS temp directory and removed in `finally`
 * to avoid passing potentially large markdown payloads as command arguments.
 */

const execFileAsync = promisify(execFile);

// Semver-ish: optional `v` prefix, MAJOR.MINOR.PATCH, optional `-prerelease`
// or `+buildmetadata` block restricted to ASCII alphanumerics, dots, and
// hyphens.
const TAG_RE = /^v?\d+\.\d+\.\d+([-+][A-Za-z0-9.-]+)?$/;
// Allow Unicode letters/digits/whitespace, common punctuation, and any
// dash punctuation (`\p{Pd}` covers `-`, en dash, em dash, etc.) so the
// default name `Design tokens — YYYY-MM-DD` validates.
const NAME_RE = /^[\p{L}\p{N}\p{Zs}\p{Pd}._:()\[\]\/+]{1,200}$/u;

export interface CreateGitHubReleaseInput {
  tag: string;
  name: string;
  body: string;
  target?: string;
  prerelease?: boolean;
}

export type CreateGitHubReleaseResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type GhReleaseReadiness =
  | { ready: true }
  | { ready: false; reason: string };

export async function createGitHubRelease(
  input: CreateGitHubReleaseInput
): Promise<CreateGitHubReleaseResult> {
  if (!isLocalRuntime()) {
    return {
      ok: false,
      error: "GitHub release publish is disabled in hosted runtime.",
    };
  }

  const tag = input.tag?.trim() ?? "";
  if (!TAG_RE.test(tag)) {
    return {
      ok: false,
      error: "Invalid tag. Use semver such as v1.2.3, 1.2.3, or v1.2.3-rc.1.",
    };
  }

  const name = input.name?.trim() ?? "";
  if (!NAME_RE.test(name)) {
    return { ok: false, error: "Invalid release name." };
  }

  const body = typeof input.body === "string" ? input.body : "";

  const target = input.target?.trim();
  if (target && !/^[A-Za-z0-9._\/-]{1,200}$/.test(target)) {
    return { ok: false, error: "Invalid target ref." };
  }

  let workDir: string | null = null;
  let notesPath: string | null = null;
  try {
    workDir = await mkdtemp(path.join(tmpdir(), "rozetta-release-"));
    const safeTag = tag.replace(/[^A-Za-z0-9._-]/g, "_");
    notesPath = path.join(workDir, `rozetta-release-${safeTag}.md`);
    await writeFile(notesPath, body, "utf8");

    const args = [
      "release",
      "create",
      tag,
      "--title",
      name,
      "--notes-file",
      notesPath,
    ];
    if (target) args.push("--target", target);
    if (input.prerelease) args.push("--prerelease");

    const stdout = await runGh(args);
    const url = extractReleaseUrl(stdout);
    if (!url) {
      return {
        ok: false,
        error: "gh release create succeeded but did not return a URL.",
      };
    }
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  } finally {
    if (notesPath) {
      await rm(notesPath, { force: true }).catch(() => {});
    }
    if (workDir) {
      await rm(workDir, { force: true, recursive: true }).catch(() => {});
    }
  }
}

export async function checkGhReleaseReadiness(): Promise<GhReleaseReadiness> {
  if (!isLocalRuntime()) {
    return {
      ready: false,
      reason: "GitHub release publish is disabled in hosted runtime.",
    };
  }

  try {
    await runGh(["--version"]);
  } catch {
    return {
      ready: false,
      reason: "gh CLI is not available on PATH. Install GitHub CLI from https://cli.github.com/.",
    };
  }

  try {
    await runGh(["auth", "status"]);
  } catch (err) {
    const detail = messageOf(err);
    return {
      ready: false,
      reason: `gh is not authenticated. Run \`gh auth login\`. (${detail})`,
    };
  }

  return { ready: true };
}

function isLocalRuntime(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.NEXT_RUNTIME === "edge") return false;
  return true;
}

async function runGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
  return stdout;
}

function extractReleaseUrl(stdout: string): string | null {
  // `gh release create` prints the release URL on its own line in stdout.
  const match = stdout.match(/https?:\/\/\S+/);
  return match ? match[0]!.trim() : null;
}

function messageOf(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = (err as { stderr?: string }).stderr;
    if (typeof stderr === "string" && stderr.trim()) {
      return stderr.split("\n")[0]!.trim();
    }
  }
  if (err instanceof Error) return err.message;
  return "Unknown gh error.";
}
