"use server";

import { revalidatePath } from "next/cache";

import {
  appendAiConversationMessages,
  applyAiPatchToWorkspaceDraft,
  buildAiReasoningSteps,
  buildAiToolCalls,
  createAssistantConversationMessage,
  createDeterministicAiProposal,
  createUserConversationMessage,
  shouldQueueAiProposal,
  previewAiPatch as previewAiPatchPure,
  redactAiSettings,
  summarizeAiSession,
} from "./registry";
import { createModelAiProposal } from "./model";
import { checkLocalReadiness, runLocalProvider } from "./local-agent";
import { isLocalProviderKind, type AiLocalProviderReadiness } from "./local-agent/types";
import {
  clearAiConversationFile,
  loadAiConversationFile,
  loadAiPatchQueueFile,
  loadAiSessionsFile,
  loadAiSettingsFile,
  writeAiConversationFile,
  writeAiPatchQueueFile,
  writeAiSessionsFile,
  writeAiSettingsFile,
} from "./filesystem";
import type {
  AiApplyResult,
  AiCommandInput,
  AiConversation,
  AiConversationMessage,
  AiCommandSession,
  AiPatchProposal,
  AiReviewResult,
  AiSettings,
  AiWorkspaceDraft,
} from "@/lib/workspace/types";

export type SaveAiSettingsResult =
  | { ok: true; path: string; settings: AiSettings }
  | { ok: false; error: string };

export type RunAiCommandResult =
  | {
      ok: true;
      assistantMessage: AiConversationMessage;
      conversation: AiConversation;
      proposal?: AiPatchProposal;
      patchQueue: AiPatchProposal[];
      sessions: AiCommandSession[];
      settings: AiSettings;
    }
  | { ok: false; error: string };

export async function getAiSettings() {
  return loadAiSettingsFile({ redact: true });
}

export async function saveAiSettings(settings: AiSettings): Promise<SaveAiSettingsResult> {
  try {
    const path = await writeAiSettingsFile(settings);
    const saved = await loadAiSettingsFile({ redact: true });
    revalidateAiRoutes();
    return { ok: true, path, settings: saved.settings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save AI settings.",
    };
  }
}

export async function getAiPatchQueue() {
  return loadAiPatchQueueFile();
}

export async function saveAiPatchQueue(patches: AiPatchProposal[]) {
  const path = await writeAiPatchQueueFile(patches);
  revalidateAiRoutes();
  return { path, patches };
}

export async function getAiSessions() {
  return loadAiSessionsFile();
}

export async function getAiConversation() {
  return loadAiConversationFile();
}

export async function saveAiConversation(conversation: AiConversation) {
  const path = await writeAiConversationFile(conversation);
  revalidateAiRoutes();
  return { path, conversation };
}

export async function clearAiConversation() {
  const result = await clearAiConversationFile();
  revalidateAiRoutes();
  return result;
}

export async function saveAiSessions(sessions: AiCommandSession[]) {
  const path = await writeAiSessionsFile(sessions);
  revalidateAiRoutes();
  return { path, sessions };
}

export async function runAiCommand(command: AiCommandInput): Promise<RunAiCommandResult> {
  try {
    const [settingsFile, queueFile, sessionsFile] = await Promise.all([
      loadAiSettingsFile(),
      loadAiPatchQueueFile(),
      loadAiSessionsFile(),
    ]);
    const conversationFile = await loadAiConversationFile();
    const provider =
      settingsFile.settings.providers.find((item) => item.id === command.providerId) ??
      settingsFile.settings.providers.find((item) => item.id === settingsFile.settings.activeProviderId) ??
      settingsFile.settings.providers[0];

    const deterministicBase = createDeterministicAiProposal(command);
    const isLocalKind = Boolean(provider && isLocalProviderKind(provider.kind));
    const localResult =
      isLocalKind && provider
        ? await runLocalProvider({ command, provider, baseProposal: deterministicBase })
        : null;
    const proposal: AiPatchProposal = localResult?.ok
      ? localResult.proposal
      : provider && provider.kind !== "deterministic" && !isLocalKind
        ? await createModelAiProposal({ command, provider })
        : localResult && !localResult.ok
          ? {
              ...deterministicBase,
              summary:
                `${deterministicBase.summary} Local provider unavailable, used the deterministic fallback. ${localResult.error}`.trim(),
            }
          : deterministicBase;
    const patchQueued = shouldQueueAiProposal(proposal);
    const now = new Date().toISOString();
    const assistantNow = new Date(Date.parse(now) + 1).toISOString();
    const toolCalls = buildAiToolCalls(command);
    const reasoningSteps = buildAiReasoningSteps(command, proposal);
    const userMessage = createUserConversationMessage({ command, now });
    const assistantMessage = createAssistantConversationMessage({
      command,
      proposal,
      patchQueued,
      reasoningSteps,
      toolCalls,
      now: assistantNow,
    });
    const session = summarizeAiSession({ command, proposal });
    const patchQueue = patchQueued
      ? [proposal, ...queueFile.patches.filter((patch) => patch.id !== proposal.id)].slice(0, 50)
      : queueFile.patches;
    const sessions = [session, ...sessionsFile.sessions.filter((item) => item.id !== session.id)].slice(0, 50);
    const conversation = appendAiConversationMessages(conversationFile.conversation, [
      userMessage,
      assistantMessage,
    ]);

    await Promise.all([
      writeAiPatchQueueFile(patchQueue),
      writeAiSessionsFile(sessions),
      writeAiConversationFile(conversation),
    ]);
    revalidateAiRoutes();
    return {
      ok: true,
      assistantMessage,
      conversation,
      proposal: patchQueued ? proposal : undefined,
      patchQueue,
      sessions,
      settings: redactAiSettings(settingsFile.settings),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to run AI command.",
    };
  }
}

export async function previewAiPatch(input: {
  proposal: AiPatchProposal;
  workspace: AiWorkspaceDraft;
}): Promise<AiReviewResult> {
  return previewAiPatchPure(input.proposal, input.workspace);
}

export async function applyAiPatch(input: {
  proposal: AiPatchProposal;
  workspace: AiWorkspaceDraft;
}): Promise<AiApplyResult & { patchQueue?: AiPatchProposal[] }> {
  const result = applyAiPatchToWorkspaceDraft(input.proposal, input.workspace);
  if (!result.ok) return result;

  const queueFile = await loadAiPatchQueueFile();
  const now = new Date().toISOString();
  const patchQueue = queueFile.patches.map((patch) =>
    patch.id === input.proposal.id
      ? { ...patch, status: "applied" as const, updatedAt: now }
      : patch
  );
  await writeAiPatchQueueFile(patchQueue);
  revalidateAiRoutes();
  return { ...result, patchQueue };
}

export type CheckAiProviderReadinessResult =
  | { ok: true; readiness: AiLocalProviderReadiness; detail?: string }
  | { ok: false; error: string };

export async function checkAiProviderReadiness(
  providerId: string
): Promise<CheckAiProviderReadinessResult> {
  try {
    const settingsFile = await loadAiSettingsFile();
    const provider = settingsFile.settings.providers.find((item) => item.id === providerId);
    if (!provider) {
      return { ok: false, error: "Provider not found" };
    }
    if (!isLocalProviderKind(provider.kind)) {
      return { ok: true, readiness: "ready" };
    }
    const result = await checkLocalReadiness(provider);
    return { ok: true, readiness: result.readiness, detail: result.detail };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to check provider readiness.",
    };
  }
}

function revalidateAiRoutes() {
  // Only `/ai` consumes AI patch/session/conversation state at page-load time;
  // the other routes used to be invalidated defensively but never read that
  // state on render.
  revalidatePath("/ai");
}
