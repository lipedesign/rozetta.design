import { promises as fs } from "node:fs";
import path from "node:path";

import {
  mergeAiSettings,
  createDefaultAiConversation,
  normalizeAiConversation,
  normalizeAiSettings,
  redactAiSettings,
} from "./registry";
import type {
  AiCommandSession,
  AiConversation,
  AiPatchProposal,
  AiSettings,
} from "@/lib/workspace/types";

const ROZETTA_DIR = path.join(process.cwd(), ".rozetta");
const SETTINGS_PATH = path.join(ROZETTA_DIR, "ai-settings.local.json");
const PATCHES_PATH = path.join(ROZETTA_DIR, "ai-patches.json");
const SESSIONS_PATH = path.join(ROZETTA_DIR, "ai-sessions.json");
const CONVERSATION_PATH = path.join(ROZETTA_DIR, "ai-conversations.json");

export interface AiSettingsFile {
  exists: boolean;
  path: string;
  settings: AiSettings;
}

export interface AiPatchQueueFile {
  exists: boolean;
  path: string;
  patches: AiPatchProposal[];
}

export interface AiSessionsFile {
  exists: boolean;
  path: string;
  sessions: AiCommandSession[];
}

export interface AiConversationFile {
  exists: boolean;
  path: string;
  conversation: AiConversation;
}

export async function loadAiSettingsFile(options?: {
  redact?: boolean;
}): Promise<AiSettingsFile> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    const settings = normalizeAiSettings(JSON.parse(raw));
    return {
      exists: true,
      path: SETTINGS_PATH,
      settings: options?.redact ? redactAiSettings(settings) : settings,
    };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[ai] failed to read settings", err);
    const settings = normalizeAiSettings(undefined);
    return {
      exists: false,
      path: SETTINGS_PATH,
      settings: options?.redact ? redactAiSettings(settings) : settings,
    };
  }
}

export async function writeAiSettingsFile(settings: AiSettings): Promise<string> {
  const existing = await loadAiSettingsFile();
  const merged = mergeAiSettings(existing.settings, settings);
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  return SETTINGS_PATH;
}

export async function loadAiPatchQueueFile(): Promise<AiPatchQueueFile> {
  try {
    const raw = await fs.readFile(PATCHES_PATH, "utf-8");
    return {
      exists: true,
      path: PATCHES_PATH,
      patches: normalizePatchQueue(JSON.parse(raw)),
    };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[ai] failed to read patch queue", err);
    return { exists: false, path: PATCHES_PATH, patches: [] };
  }
}

export async function writeAiPatchQueueFile(patches: AiPatchProposal[]): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(
    PATCHES_PATH,
    `${JSON.stringify(normalizePatchQueue(patches), null, 2)}\n`,
    "utf-8"
  );
  return PATCHES_PATH;
}

export async function loadAiSessionsFile(): Promise<AiSessionsFile> {
  try {
    const raw = await fs.readFile(SESSIONS_PATH, "utf-8");
    return {
      exists: true,
      path: SESSIONS_PATH,
      sessions: normalizeSessions(JSON.parse(raw)),
    };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[ai] failed to read sessions", err);
    return { exists: false, path: SESSIONS_PATH, sessions: [] };
  }
}

export async function writeAiSessionsFile(sessions: AiCommandSession[]): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(
    SESSIONS_PATH,
    `${JSON.stringify(normalizeSessions(sessions), null, 2)}\n`,
    "utf-8"
  );
  return SESSIONS_PATH;
}

export async function loadAiConversationFile(): Promise<AiConversationFile> {
  try {
    const raw = await fs.readFile(CONVERSATION_PATH, "utf-8");
    return {
      exists: true,
      path: CONVERSATION_PATH,
      conversation: normalizeAiConversation(JSON.parse(raw)),
    };
  } catch (err) {
    if (!isMissingFileError(err)) console.warn("[ai] failed to read conversation", err);
    return {
      exists: false,
      path: CONVERSATION_PATH,
      conversation: createDefaultAiConversation(),
    };
  }
}

export async function writeAiConversationFile(conversation: AiConversation): Promise<string> {
  await fs.mkdir(ROZETTA_DIR, { recursive: true });
  await fs.writeFile(
    CONVERSATION_PATH,
    `${JSON.stringify(normalizeAiConversation(conversation), null, 2)}\n`,
    "utf-8"
  );
  return CONVERSATION_PATH;
}

export async function clearAiConversationFile(): Promise<AiConversationFile> {
  const conversation = createDefaultAiConversation();
  await writeAiConversationFile(conversation);
  return { exists: true, path: CONVERSATION_PATH, conversation };
}

function normalizePatchQueue(value: unknown): AiPatchProposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((patch): patch is AiPatchProposal => {
      if (!patch || typeof patch !== "object") return false;
      const item = patch as Partial<AiPatchProposal>;
      return (
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.summary === "string" &&
        Array.isArray(item.operations) &&
        typeof item.createdAt === "string"
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function normalizeSessions(value: unknown): AiCommandSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((session): session is AiCommandSession => {
      if (!session || typeof session !== "object") return false;
      const item = session as Partial<AiCommandSession>;
      return (
        typeof item.id === "string" &&
        typeof item.kind === "string" &&
        typeof item.promptSummary === "string" &&
        typeof item.createdAt === "string" &&
        Array.isArray(item.patchIds)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isMissingFileError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
