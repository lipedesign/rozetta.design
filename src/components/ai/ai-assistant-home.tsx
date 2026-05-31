"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FileTextIcon,
  InboxIcon,
  LightbulbIcon,
  MessageSquareIcon,
  PencilLineIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  Wand2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  applyAiPatch,
  checkAiProviderReadiness,
  runAiCommand,
  saveAiPatchQueue,
} from "@/lib/ai-os/actions";
import {
  DEFAULT_AI_CONTEXT,
  listAiSlashCommands,
  previewAiPatch,
  searchAiMentions,
} from "@/lib/ai-os/registry";
import { saveBrands, saveComponents } from "@/lib/design-system/actions";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { getCollectionModeRoot, getCollectionModes } from "@/lib/dtcg/collections";
import type { TokenSet } from "@/lib/dtcg/types";
import { saveExportProfiles } from "@/lib/export-profiles/actions";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { AiPromptInput } from "@/components/ai/ai-prompt-input";
import { AiSessionsPane } from "@/components/ai/ai-sessions-pane";
import {
  AiReviewQueue,
  archivePatchGroup,
  getPatchGroupKey,
} from "@/components/ai/ai-review-queue";
import type { AiShortcut } from "@/components/ai/ai-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FrostedEdgeBlur } from "@/components/ui/frosted-edge-blur";
import { cn } from "@/lib/utils";
import type {
  AiAttachmentContext,
  AiCommandInput,
  AiConversation,
  AiConversationMessage,
  AiCommandSession,
  AiGitScope,
  AiMentionContext,
  AiPatchProposal,
  AiReadOnlyToolCall,
  AiReasoningStep,
  AiSettings,
  AiSlashCommand,
  AiTaskContext,
  AiTaskKind,
  ExportProfile,
  GitStatusSummary,
  OperationalContext,
} from "@/lib/workspace/types";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";

interface AiAssistantHomeProps {
  initialSettings: AiSettings;
  initialPatches: AiPatchProposal[];
  initialSessions: AiCommandSession[];
  initialConversation: AiConversation;
  exportProfiles: ExportProfile[];
  baselineSets: TokenSet[];
  git: GitStatusSummary;
  operational?: OperationalContext;
}

const AI_SHORTCUTS: AiShortcut[] = [
  {
    value: "explain-issues",
    title: "Audit workspace",
    description: "Find the highest-impact issues.",
    prompt: "Audit this workspace and explain the most important design system issues.",
    icon: ShieldCheckIcon,
  },
  {
    value: "propose-fixes",
    title: "Propose fixes",
    description: "Create safe reviewed suggestions.",
    prompt: "Review the workspace and propose safe fixes I can apply after review.",
    icon: LightbulbIcon,
  },
  {
    value: "release-notes",
    title: "Release notes",
    description: "Draft notes from the current diff.",
    prompt: "Generate release notes from the current design system changes.",
    icon: FileTextIcon,
  },
  {
    value: "suggest-names",
    title: "Improve naming",
    description: "Suggest clearer token names.",
    prompt: "Suggest clearer token and design system naming improvements.",
    icon: PencilLineIcon,
  },
  {
    value: "workspace-question",
    title: "Ask workspace",
    description: "Ask about the current state.",
    prompt: "Answer my question using the current workspace context.",
    icon: MessageSquareIcon,
  },
  {
    value: "design-system",
    title: "Design System proposal",
    description: "Review components and system structure.",
    prompt: "Review the design system registry and propose useful component, token, or theme improvements.",
    icon: Wand2Icon,
  },
];

export function AiAssistantHome({
  initialSettings,
  initialPatches,
  initialSessions,
  initialConversation,
  exportProfiles,
  baselineSets,
  git,
  operational,
}: AiAssistantHomeProps) {
  const sets = useTokensStore((state) => state.sets);
  const originals = useTokensStore((state) => state.originals);
  const replaceSetRoot = useTokensStore((state) => state.replaceSetRoot);
  const themes = useThemesStore((state) => state.themes);
  const upsertThemes = useThemesStore((state) => state.upsertThemes);
  const brands = useDesignSystemStore((state) => state.brands);
  const components = useDesignSystemStore((state) => state.components);
  const hydrateDesignSystem = useDesignSystemStore((state) => state.hydrate);

  const [taskKind, setTaskKind] = useState<AiTaskKind>("propose-fixes");
  const [prompt, setPrompt] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState<AiTaskContext>({
    ...DEFAULT_AI_CONTEXT,
    brands: false,
  });
  const [gitScope, setGitScope] = useState<AiGitScope>(
    git.available ? "current-branch" : "none"
  );
  const [settings, setSettings] = useState(initialSettings);
  const [patchQueue, setPatchQueue] = useState(initialPatches);
  const [sessions, setSessions] = useState(initialSessions);
  const [conversation, setConversation] = useState(initialConversation);
  const [profiles, setProfiles] = useState(exportProfiles);
  const [selectedPatchId, setSelectedPatchId] = useState<string | undefined>(
    initialPatches[0]?.id
  );
  const [releaseNotes, setReleaseNotes] = useState("");
  const [mentions, setMentions] = useState<AiMentionContext[]>([]);
  const [slashCommandId, setSlashCommandId] = useState<AiSlashCommand["id"]>();
  const [isPending, startTransition] = useTransition();

  const [localReadiness, setLocalReadiness] = useState<
    | {
        providerId: string;
        readiness:
          | "ready"
          | "missing"
          | "unauthenticated"
          | "disabled-runtime"
          | "misconfigured"
          | "unknown";
      }
    | undefined
  >(undefined);

  const activeProvider =
    settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
    settings.providers[0];
  const isLocalProvider =
    activeProvider?.kind === "claude-code-local" ||
    activeProvider?.kind === "codex-local";
  const activeProviderId = activeProvider?.id;
  const currentReadiness =
    isLocalProvider && localReadiness?.providerId === activeProviderId
      ? localReadiness.readiness
      : undefined;

  useEffect(() => {
    if (!isLocalProvider || !activeProviderId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await checkAiProviderReadiness(activeProviderId);
      if (cancelled) return;
      if (result.ok) {
        setLocalReadiness({ providerId: activeProviderId, readiness: result.readiness });
      } else {
        setLocalReadiness({ providerId: activeProviderId, readiness: "unknown" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProviderId, isLocalProvider]);
  const activePatchQueue = useMemo(
    () =>
      patchQueue.filter(
        (patch) => patch.status !== "dismissed" && patch.status !== "applied"
      ),
    [patchQueue]
  );
  const selectedPatch =
    activePatchQueue.find((patch) => patch.id === selectedPatchId) ??
    activePatchQueue[0];
  const dirtySetIds = useMemo(
    () =>
      sets
        .filter((set) => {
          const original = originals[set.id];
          if (!original) return true;
          return JSON.stringify(set.root) !== JSON.stringify(original);
        })
        .map((set) => set.id),
    [originals, sets]
  );
  const localOnlySetIds = useMemo(
    () => sets.filter((set) => !originals[set.id]).map((set) => set.id),
    [originals, sets]
  );
  const workspaceDraft = useMemo(
    () => ({ sets, themes, brands, components, exportProfiles: profiles }),
    [brands, components, profiles, sets, themes]
  );
  const componentsWithoutBrandScopes = useMemo(
    () => components.map((component) => ({ ...component, brandIds: [] })),
    [components]
  );
  const workspaceHealth = useMemo(
    () =>
      buildWorkspaceHealth({
        sets,
        themes,
        exportProfiles: profiles,
        brands: [],
        components: componentsWithoutBrandScopes,
        dirtySetIds,
        localOnlySetIds,
        git,
      }),
    [componentsWithoutBrandScopes, dirtySetIds, git, localOnlySetIds, profiles, sets, themes]
  );
  const preview = useMemo(
    () => (selectedPatch ? previewAiPatch(selectedPatch, workspaceDraft) : undefined),
    [selectedPatch, workspaceDraft]
  );
  const providerUsesFallback =
    !activeProvider ||
    activeProvider.kind === "deterministic" ||
    !activeProvider.enabled ||
    !activeProvider.hasApiKey;
  const aiWorkspace = useMemo(
    () => ({
      sets,
      baselineSets,
      themes,
      brands: [],
      components: componentsWithoutBrandScopes,
      exportProfiles: profiles,
      git: gitScope === "none" ? undefined : git,
      operational,
    }),
    [baselineSets, componentsWithoutBrandScopes, git, gitScope, operational, profiles, sets, themes]
  );
  const slashCommands = useMemo(() => listAiSlashCommands(), []);
  const mentionOptions = useMemo(
    () => searchAiMentions(aiWorkspace),
    [aiWorkspace]
  );

  function handleSlashCommandSelect(command: AiSlashCommand | undefined) {
    if (!command) {
      setSlashCommandId(undefined);
      return;
    }
    setSlashCommandId(command.id);
    setTaskKind(command.taskKind);
  }

  function handleSuggestionSelect(value: string) {
    const shortcut = AI_SHORTCUTS.find((item) => item.value === value);
    if (!shortcut) return;

    const command = slashCommands.find(
      (item) =>
        item.defaultPrompt === shortcut.prompt ||
        (item.taskKind === shortcut.value && item.label === shortcut.title)
    );
    setTaskKind(shortcut.value);
    setSlashCommandId(command?.id);
    setPrompt(shortcut.prompt);
  }

  function handleRun(payload?: {
    attachments: AiAttachmentContext[];
    mentions: AiMentionContext[];
    prompt: string;
    slashCommandId?: AiSlashCommand["id"];
    toolPreference: "read-only";
  }) {
    startTransition(async () => {
      const nextPrompt = payload?.prompt.trim() || prompt.trim();
      if (!nextPrompt) {
        toast.error("Type a prompt first");
        return;
      }
      const attachments = payload?.attachments ?? [];
      const nextMentions = payload?.mentions ?? mentions;
      const nextSlashCommandId = payload?.slashCommandId ?? slashCommandId;
      const effectiveContext =
        gitScope === "none"
          ? { ...context, brands: false, git: false }
          : { ...context, brands: false };
      const command: AiCommandInput = {
        kind: taskKind,
        prompt: nextPrompt,
        context: effectiveContext,
        gitScope,
        outputMode: "review-suggestion",
        targetScope: "workspace",
        attachments,
        mentions: nextMentions,
        slashCommandId: nextSlashCommandId,
        toolPreference: "read-only" as const,
        providerId: activeProvider?.id,
        workspace: aiWorkspace,
      };
      const result = await runAiCommand(command);
      if (!result.ok) {
        toast.error("AI request failed", { description: result.error });
        return;
      }
      setPatchQueue(result.patchQueue);
      setConversation(result.conversation);
      setSessions(result.sessions);
      setSettings(result.settings);
      if (result.proposal) setSelectedPatchId(result.proposal.id);
      setMentions([]);
      setSlashCommandId(undefined);
      setPrompt("");
      toast.success(result.proposal ? "Suggestion ready for review" : "AI response ready");
    });
  }

  function handleApplyPatch() {
    if (!selectedPatch) return;
    startTransition(async () => {
      const result = await applyAiPatch({ proposal: selectedPatch, workspace: workspaceDraft });
      if (!result.ok || !result.draft) {
        toast.error("Suggestion was not applied", {
          description: result.issues[0]?.detail ?? result.message,
        });
        return;
      }

      for (const set of result.draft.sets) replaceSetRoot(set.id, set.root);
      upsertThemes(result.draft.themes);
      hydrateDesignSystem({
        brands: result.draft.brands,
        components: result.draft.components,
      });
      await Promise.all([
        saveBrands(result.draft.brands),
        saveComponents(result.draft.components),
        saveExportProfiles(result.draft.exportProfiles),
      ]);
      setProfiles(result.draft.exportProfiles);
      setReleaseNotes(result.draft.releaseNotes ?? releaseNotes);
      if (result.patchQueue) setPatchQueue(result.patchQueue);
      toast.success("Reviewed changes applied");
    });
  }

  function handlePreviewPatch() {
    if (!selectedPatch) return;
    if (preview?.ok) {
      toast.success("Preview ready", {
        description: `${selectedPatch.operations.length} suggested change${
          selectedPatch.operations.length === 1 ? "" : "s"
        } validated.`,
      });
      return;
    }
    toast.error("Preview blocked", {
      description: preview?.issues[0]?.title ?? "This suggestion needs review before apply.",
    });
  }

  function handleArchivePatchGroup(patchIds: string[]) {
    if (patchIds.length === 0) return;
    startTransition(async () => {
      const groupPatch = patchQueue.find((patch) => patchIds.includes(patch.id));
      if (!groupPatch) return;

      const nextQueue = archivePatchGroup(
        patchQueue,
        getPatchGroupKey(groupPatch)
      );
      const saved = await saveAiPatchQueue(nextQueue);
      setPatchQueue(saved.patches);
      setSelectedPatchId(
        saved.patches.find(
          (patch) => patch.status !== "dismissed" && patch.status !== "applied"
        )?.id
      );
      toast.success("Suggestion group archived", {
        description: `${patchIds.length} suggestion${patchIds.length === 1 ? "" : "s"} hidden from review.`,
      });
    });
  }

  return (
    <>
      <AiSessionsPane
        sessions={sessions}
        onNewConversation={() => {
          const now = new Date().toISOString();
          setConversation((prev) => ({
            ...prev,
            messages: [],
            updatedAt: now,
          }));
          setPrompt("");
        }}
        onSelectSession={(session) => {
          setPrompt(session.promptSummary);
          setTaskKind(session.kind);
        }}
      />
      <div className="grid min-h-0 flex-1 overflow-hidden bg-background lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-base font-semibold">Rozetta AI</h1>
            <Badge
              variant={providerUsesFallback ? "secondary" : "default"}
              className="ml-1"
            >
              {activeProvider?.kind === "claude-code-local"
                ? "Claude Code · local"
                : activeProvider?.kind === "codex-local"
                  ? "Codex · local"
                  : providerUsesFallback
                    ? "Local fallback"
                    : activeProvider.label}
            </Badge>
            {currentReadiness === "missing" ||
            currentReadiness === "unauthenticated" ||
            currentReadiness === "misconfigured" ? (
              <Link
                href="/settings"
                className="ml-1 truncate text-xs text-muted-foreground hover:text-foreground"
              >
                Setup needed in Settings &rarr; AI Providers
              </Link>
            ) : null}
            {currentReadiness === "disabled-runtime" ? (
              <span className="ml-1 truncate text-xs text-muted-foreground">
                Local providers are disabled in this runtime.
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {activePatchQueue.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={scrollReviewIntoView}
                aria-label={`Review ${activePatchQueue.length} suggestion${activePatchQueue.length === 1 ? "" : "s"}`}
              >
                <InboxIcon className="size-3.5" />
                <span>Review</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {activePatchQueue.length}
                </span>
              </Button>
            ) : null}
            <Button
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              render={<Link href="/settings" />}
            >
              <Settings2Icon className="size-3.5" />
              Settings
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 px-5 pb-5">
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="relative isolate flex min-h-0 flex-1 overflow-hidden [clip-path:inset(0)] contain-paint">
              <Conversation className="h-full min-h-0 flex-1">
                <ConversationContent
                  scrollClassName="overflow-y-auto overscroll-contain"
                  className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pt-16 pb-20"
                >
                  {conversation.messages.length === 0 ? (
                    <InitialAssistantMessage
                      components={components.length}
                      onSuggestionSelect={handleSuggestionSelect}
                      sets={sets.length}
                      tokens={countTokens(sets)}
                    />
                  ) : (
                    conversation.messages.map((message) => (
                      <ConversationMessage
                        key={message.id}
                        message={message}
                        patch={message.patchId ? patchQueue.find((patch) => patch.id === message.patchId) : undefined}
                      />
                    ))
                  )}

                  {isPending ? <AiThinkingIndicator /> : null}
                </ConversationContent>
                <ConversationScrollButton className="z-40 bg-background shadow-sm" />
              </Conversation>
              <FrostedEdgeBlur
                position="top"
                height="56px"
                surface="var(--background)"
                blurLevels={[0.5, 1, 2, 4, 8, 16]}
              />
              <FrostedEdgeBlur
                position="bottom"
                height="72px"
                surface="var(--background)"
                blurLevels={[0.5, 1, 2, 4, 8, 16]}
              />
            </div>

            <AiPromptInput
              className="mt-auto"
              context={context}
              contextOpen={contextOpen}
              git={git}
              gitScope={gitScope}
              isPending={isPending}
              mentionOptions={mentionOptions}
              mentions={mentions}
              onContextChange={(key, checked) =>
                setContext((current) => ({ ...current, [key]: checked }))
              }
              onContextOpenChange={setContextOpen}
              onGitScopeChange={setGitScope}
              onMentionsChange={setMentions}
              onPromptChange={setPrompt}
              onSlashCommandSelect={handleSlashCommandSelect}
              onSubmit={handleRun}
              prompt={prompt}
              slashCommandId={slashCommandId}
              slashCommands={slashCommands}
            />
          </section>
        </main>
      </div>

      <aside
        data-ai-review-rail
        className="flex min-h-0 flex-col gap-4 overflow-hidden border-l px-5 py-5"
      >
        <AiReviewQueue
          git={git}
          health={workspaceHealth}
          isPending={isPending}
          onApply={handleApplyPatch}
          onArchiveGroup={handleArchivePatchGroup}
          onCopy={() =>
            selectedPatch &&
            copyText(JSON.stringify(selectedPatch, null, 2), "Suggestion copied")
          }
          operational={operational}
          onPreview={handlePreviewPatch}
          onSelect={setSelectedPatchId}
          patchQueue={patchQueue}
          preview={preview}
          releaseNotes={releaseNotes}
          selectedPatch={selectedPatch}
          selectedPatchId={selectedPatch?.id}
          sessionsCount={sessions.length}
        />
      </aside>
      </div>
    </>
  );
}

function InitialAssistantMessage({
  components,
  onSuggestionSelect,
  sets,
  tokens,
}: {
  components: number;
  onSuggestionSelect: (value: string) => void;
  sets: number;
  tokens: number;
}) {
  return (
    <Empty className="min-h-0 flex-none gap-6 border-0 bg-transparent p-0 text-left">
      <EmptyContent className="max-w-2xl items-center gap-4">
        <EmptyMedia variant="icon" className="bg-foreground text-background">
          <SparklesIcon />
        </EmptyMedia>
        <div className="flex flex-col items-center gap-2">
          <EmptyTitle>How can I help your design system?</EmptyTitle>
          <EmptyDescription>
            Audit the workspace, explain issues, draft release notes, or prepare
            reviewed suggestions — pick a starting point or describe what you
            need.
          </EmptyDescription>
        </div>
        <WorkspaceBadges
          components={components}
          sets={sets}
          tokens={tokens}
        />
      </EmptyContent>
      <QuickSuggestions onSelect={onSuggestionSelect} />
    </Empty>
  );
}

function AiThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 pl-1 text-xs text-muted-foreground">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
        <span className="relative inline-flex size-2 rounded-full bg-foreground/70" />
      </span>
      <span>AI is thinking…</span>
    </div>
  );
}

function ConversationMessage({
  message,
  patch,
}: {
  message: AiConversationMessage;
  patch: AiPatchProposal | undefined;
}) {
  if (message.role === "user") {
    return (
      <Message from="user" className="max-w-[85%]">
        <MessageContent className="rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6">
          <MessageResponse>{message.content}</MessageResponse>
        </MessageContent>
      </Message>
    );
  }

  const hasPatch = Boolean(message.patchId);

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
        {hasPatch ? <LightbulbIcon className="size-4" /> : <SparklesIcon className="size-4" />}
      </span>
      <Message from="assistant" className="max-w-full">
        <MessageContent className="w-full max-w-2xl gap-3 px-0 py-1">
          <div className="flex items-start justify-between gap-3">
            <MessageResponse className="text-sm leading-6 text-foreground">
              {message.content}
            </MessageResponse>
            {hasPatch && (
              <Badge variant={patch?.status === "applied" ? "secondary" : "default"}>
                {patch?.status === "applied" ? "applied" : "queued"}
              </Badge>
            )}
          </div>
          {(message.providerKind || message.modelId || message.taskKind) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {message.taskKind && (
                <Badge variant="outline" className="font-normal">
                  {message.taskKind}
                </Badge>
              )}
              {message.providerKind && <span>{message.providerKind}</span>}
              {message.modelId && (
                <>
                  <span aria-hidden className="size-1 rounded-full bg-muted-foreground/40" />
                  <span className="font-mono tabular-nums">{message.modelId}</span>
                </>
              )}
            </div>
          )}
          <AgentResponseMeta
            mentions={message.mentions ?? []}
            reasoningSteps={message.reasoningSteps ?? []}
            toolCalls={message.toolCalls ?? []}
          />
        </MessageContent>
      </Message>
    </div>
  );
}

function AgentResponseMeta({
  mentions,
  reasoningSteps,
  toolCalls,
}: {
  mentions: AiMentionContext[];
  reasoningSteps: AiReasoningStep[];
  toolCalls: AiReadOnlyToolCall[];
}) {
  if (mentions.length === 0 && reasoningSteps.length === 0 && toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {reasoningSteps.length > 0 && (
        <Reasoning
          defaultOpen={false}
          duration={2}
          className="mb-0! rounded-xl border bg-muted/20 px-3 py-2.5"
        >
          <ReasoningTrigger
            getThinkingMessage={() => <span>Reasoning summary</span>}
            className="text-xs"
          />
          <ReasoningContent className="mt-3 text-xs leading-5 text-muted-foreground">
            {formatReasoningText(reasoningSteps)}
          </ReasoningContent>
        </Reasoning>
      )}

      {reasoningSteps.length > 0 && (
        <ChainOfThought
          defaultOpen={false}
          className="rounded-xl border bg-muted/20 px-3 py-2.5"
        >
          <ChainOfThoughtHeader className="text-xs">Agent steps</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {reasoningSteps.map((step) => (
              <ChainOfThoughtStep
                key={`${step.title}:${step.description}`}
                label={step.title}
                description={step.description}
                status={step.status}
              />
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )}

      {toolCalls.length > 0 && (
        <div className="flex flex-col gap-3">
          {toolCalls.map((call) => (
            <Tool
              key={call.id}
              defaultOpen={false}
              className="mb-0! rounded-xl bg-card"
            >
              <ToolHeader
                title={call.title}
                type={`tool-${call.name}` as `tool-${string}`}
                state={call.state as never}
              />
              <ToolContent>
                <ToolInput input={call.input as never} />
                <ToolOutput output={call.output as never} errorText={call.errorText as never} />
              </ToolContent>
            </Tool>
          ))}
        </div>
      )}

      {mentions.length > 0 && (
        <Sources className="mb-0! rounded-xl border bg-muted/20 px-3 py-2.5 text-foreground">
          <SourcesTrigger count={mentions.length} className="text-xs">
            <span className="font-medium">Used {mentions.length} context source{mentions.length === 1 ? "" : "s"}</span>
          </SourcesTrigger>
          <SourcesContent className="w-full">
            {mentions.map((mention) => (
              <Source
                key={mention.id}
                href={mention.path ? `#${mention.path}` : "#"}
                title={mention.label}
                className="rounded-xl bg-background px-3 py-2 text-muted-foreground hover:text-foreground"
              >
                <span className="truncate font-medium">@{mention.label}</span>
                <Badge variant="outline">{mention.kind}</Badge>
              </Source>
            ))}
          </SourcesContent>
        </Sources>
      )}
    </div>
  );
}

function WorkspaceBadges({
  components,
  sets,
  tokens,
}: {
  components: number;
  sets: number;
  tokens: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{sets} collections</Badge>
      <Badge variant="secondary">{tokens} tokens</Badge>
      <Badge variant="secondary">{components} components</Badge>
    </div>
  );
}

function QuickSuggestions({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2 lg:grid-cols-3">
      {AI_SHORTCUTS.map((shortcut) => {
        const Icon = shortcut.icon;
        return (
          <button
            key={shortcut.value}
            type="button"
            onClick={() => onSelect(shortcut.value)}
            className={cn(
              "group flex flex-col items-start gap-1.5 rounded-xl border bg-card p-3 text-left",
              "transition-colors hover:border-foreground/20 hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
              <Icon className="size-3.5" />
            </span>
            <span className="text-sm font-medium leading-tight text-foreground">
              {shortcut.title}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">
              {shortcut.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatReasoningText(steps: AiReasoningStep[]) {
  return steps.map((step) => `- ${step.title}: ${step.description}`).join("\n");
}

function countTokens(sets: TokenSet[]): number {
  let count = 0;
  const walk = (node: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (value && typeof value === "object" && "$value" in value) count += 1;
      else if (value && typeof value === "object") walk(value as Record<string, unknown>);
    }
  };
  for (const set of sets) {
    for (const mode of getCollectionModes(set)) {
      walk(getCollectionModeRoot(set, mode.id));
    }
  }
  return count;
}

function scrollReviewIntoView() {
  if (typeof document === "undefined") return;
  const target = document.querySelector<HTMLElement>("[data-ai-review-rail]");
  target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "end" });
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
