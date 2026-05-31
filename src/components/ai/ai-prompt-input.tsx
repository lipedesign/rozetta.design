"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { FileUIPart } from "ai";
import {
  ArrowUpIcon,
  GitBranchIcon,
  HashIcon,
  PlusIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FrostedEdgeBlur } from "@/components/ui/frosted-edge-blur";
import type {
  AiAttachmentContext,
  AiGitScope,
  AiMentionContext,
  AiMentionKind,
  AiSlashCommand,
  AiTaskContext,
  GitStatusSummary,
} from "@/lib/workspace/types";

const CONTEXT_KEYS: Array<keyof AiTaskContext> = [
  "sets",
  "themes",
  "components",
  "releases",
  "git",
];

const CONTEXT_PRESETS = [
  {
    value: "full-workspace",
    label: "Full workspace",
    context: {
      sets: true,
      themes: true,
      brands: false,
      components: true,
      releases: true,
      git: true,
    },
  },
  {
    value: "tokens",
    label: "Tokens",
    context: {
      sets: true,
      themes: true,
      brands: false,
      components: false,
      releases: false,
      git: false,
    },
  },
  {
    value: "design-system",
    label: "Design System",
    context: {
      sets: true,
      themes: true,
      brands: false,
      components: true,
      releases: false,
      git: false,
    },
  },
  {
    value: "release",
    label: "Release",
    context: {
      sets: true,
      themes: true,
      brands: false,
      components: false,
      releases: true,
      git: true,
    },
  },
  {
    value: "git-changes",
    label: "Git changes",
    context: {
      sets: true,
      themes: true,
      brands: false,
      components: true,
      releases: false,
      git: true,
    },
  },
  {
    value: "custom",
    label: "Custom",
    context: null,
  },
] satisfies Array<{
  value: string;
  label: string;
  context: AiTaskContext | null;
}>;

type ContextPresetValue = (typeof CONTEXT_PRESETS)[number]["value"];

type CommandState =
  | { mode: null; query: ""; kind?: undefined }
  | { mode: "mentions"; query: string; kind?: AiMentionKind; start?: number; end?: number }
  | { mode: "slash"; query: string; kind?: undefined; start?: number; end?: number };

const MENTION_GROUP_LABELS: Record<AiMentionKind, string> = {
  token: "Tokens",
  theme: "Themes",
  brand: "Brands",
  component: "Components",
  release: "Releases",
  "git-file": "Git files",
};

const COMMAND_PANEL_SCROLL_MARGIN = 28;

export interface AiPromptSubmitPayload {
  prompt: string;
  attachments: AiAttachmentContext[];
  mentions: AiMentionContext[];
  slashCommandId?: AiSlashCommand["id"];
  toolPreference: "read-only";
}

interface AiPromptInputProps {
  className?: string;
  context: AiTaskContext;
  contextOpen: boolean;
  git: GitStatusSummary;
  gitScope: AiGitScope;
  isPending: boolean;
  mentionOptions: AiMentionContext[];
  mentions: AiMentionContext[];
  onContextChange: (key: keyof AiTaskContext, checked: boolean) => void;
  onContextOpenChange: (open: boolean) => void;
  onGitScopeChange: (scope: AiGitScope) => void;
  onMentionsChange: (mentions: AiMentionContext[]) => void;
  onPromptChange: (prompt: string) => void;
  onSlashCommandSelect: (command: AiSlashCommand | undefined) => void;
  onSubmit: (payload: AiPromptSubmitPayload) => void;
  prompt: string;
  slashCommandId?: AiSlashCommand["id"];
  slashCommands: AiSlashCommand[];
}

export function AiPromptInput({
  className,
  context,
  contextOpen,
  git,
  gitScope,
  isPending,
  mentionOptions,
  mentions,
  onContextChange,
  onContextOpenChange,
  onGitScopeChange,
  onMentionsChange,
  onPromptChange,
  onSlashCommandSelect,
  onSubmit,
  prompt,
  slashCommandId,
  slashCommands,
}: AiPromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [contextPreset, setContextPreset] =
    useState<ContextPresetValue>("full-workspace");
  const [commandState, setCommandState] = useState<CommandState>({
    mode: null,
    query: "",
  });
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const selectedContextPreset =
    CONTEXT_PRESETS.find((preset) => preset.value === contextPreset) ??
    CONTEXT_PRESETS[0];
  const gitScopeOptions = getGitScopeOptions(git);
  const selectedGitScope =
    gitScopeOptions.find((option) => option.value === gitScope) ?? gitScopeOptions[0];
  const filteredMentions = filterMentionOptions(
    mentionOptions,
    commandState.query,
    commandState.kind
  );
  const filteredCommands = filterSlashCommands(slashCommands, commandState.query);
  const commandItemCount =
    commandState.mode === "mentions"
      ? filteredMentions.length
      : commandState.mode === "slash"
        ? filteredCommands.length
        : 0;
  const selectedCommandIndex =
    commandItemCount > 0 ? Math.min(activeCommandIndex, commandItemCount - 1) : -1;
  const hasRichTextPrompt =
    mentions.length > 0 || Boolean(findInlineSlashCommand(prompt, slashCommands));

  function handleSubmit(message: { files: FileUIPart[]; text: string }) {
    const nextPrompt = message.text || prompt;
    const inlineCommand = findInlineSlashCommand(nextPrompt, slashCommands);
    onSubmit({
      attachments: toAttachmentContexts(message.files),
      mentions: reconcileMentionsFromPrompt(nextPrompt, mentionOptions, mentions),
      prompt: nextPrompt,
      slashCommandId: slashCommandId ?? inlineCommand?.id,
      toolPreference: "read-only",
    });
  }

  function handlePromptChange(value: string, cursor = textareaRef.current?.selectionStart ?? value.length) {
    const nextMentions = reconcileMentionsFromPrompt(value, mentionOptions, mentions);
    const inlineCommand = findInlineSlashCommand(value, slashCommands);

    onPromptChange(value);
    onMentionsChange(nextMentions);
    onSlashCommandSelect(inlineCommand);
    setCommandState(detectPromptCommand(value, cursor));
    setActiveCommandIndex(0);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      const deletedPrompt = deleteInlinePromptElement({
        commands: slashCommands,
        key: event.key,
        mentions,
        prompt,
        selectionEnd: event.currentTarget.selectionEnd ?? prompt.length,
        selectionStart: event.currentTarget.selectionStart ?? prompt.length,
      });

      if (deletedPrompt) {
        event.preventDefault();
        handlePromptChange(deletedPrompt.nextValue, deletedPrompt.cursor);
        focusTextareaAt(deletedPrompt.cursor);
        return;
      }
    }

    if (commandState.mode === null) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setCommandState({ mode: null, query: "" });
      return;
    }

    if (commandItemCount === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCommandIndex((current) => (current + 1) % commandItemCount);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCommandIndex((current) => (current - 1 + commandItemCount) % commandItemCount);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectActiveCommandItem();
    }
  }

  function handleContextPresetChange(value: unknown) {
    const presetValue = normalizeContextPresetValue(value);
    if (!presetValue) return;
    const preset = CONTEXT_PRESETS.find((item) => item.value === presetValue);
    if (!preset) return;

    setContextPreset(preset.value);
    onContextOpenChange(preset.value === "custom");

    if (!preset.context) return;
    for (const key of CONTEXT_KEYS) {
      onContextChange(key, preset.context[key]);
    }
  }

  function handleCustomContextChange(key: keyof AiTaskContext, checked: boolean) {
    setContextPreset("custom");
    onContextChange(key, checked);
  }

  function handleGitScopeChange(value: unknown) {
    const next = normalizeGitScope(value);
    if (next) onGitScopeChange(next);
  }

  function handleSpeechTranscription(text: string) {
    const transcript = text.trim();
    if (!transcript) return;
    const nextPrompt = [prompt.trim(), transcript].filter(Boolean).join(" ");
    handlePromptChange(nextPrompt);
  }

  function handleMentionSelect(mention: AiMentionContext) {
    const insertion = `${formatInlineMention(mention)} `;
    const { nextValue, cursor } = replaceCommandRange(
      prompt,
      commandState,
      insertion,
      textareaRef.current?.selectionStart ?? prompt.length
    );
    handlePromptChange(nextValue, cursor);
    focusTextareaAt(cursor);
  }

  function handleSlashCommandSelect(command: AiSlashCommand) {
    onSlashCommandSelect(command);
    const insertion = `${formatInlineCommand(command)} `;
    const { nextValue, cursor } = replaceCommandRange(
      prompt,
      commandState,
      insertion,
      textareaRef.current?.selectionStart ?? prompt.length
    );
    handlePromptChange(nextValue, cursor);
    focusTextareaAt(cursor);
  }

  function openMentions(kind?: AiMentionKind) {
    setCommandState({ mode: "mentions", query: "", kind });
    setActiveCommandIndex(0);
  }

  function focusTextareaAt(cursor: number) {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function selectActiveCommandItem() {
    if (selectedCommandIndex < 0) return;

    if (commandState.mode === "mentions") {
      const mention = filteredMentions[selectedCommandIndex];
      if (mention) handleMentionSelect(mention);
      return;
    }

    if (commandState.mode === "slash") {
      const command = filteredCommands[selectedCommandIndex];
      if (command) handleSlashCommandSelect(command);
    }
  }

  return (
    <div className={cn("shrink-0 bg-background p-4", className)}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="relative">
          <PromptInput
            className="[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-border [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-[0_14px_30px_-22px_rgb(0_0_0_/_0.26),0_4px_10px_-7px_rgb(0_0_0_/_0.16)]"
            onSubmit={handleSubmit}
            multiple
            maxFiles={5}
            maxFileSize={1_000_000}
          >
            <PromptAttachmentPreviewList />
            <PromptInputBody>
              <div className="relative w-full">
                {hasRichTextPrompt && (
                  <PromptRichTextOverlay
                    commands={slashCommands}
                    mentions={mentions}
                    prompt={prompt}
                  />
                )}
                <PromptInputTextarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) =>
                    handlePromptChange(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart ?? event.currentTarget.value.length
                    )
                  }
                  onSelect={(event) =>
                    setCommandState(
                      detectPromptCommand(
                        event.currentTarget.value,
                        event.currentTarget.selectionStart ?? event.currentTarget.value.length
                      )
                    )
                  }
                  onKeyDown={handlePromptKeyDown}
                  placeholder="O que você quer melhorar no seu Design System?"
                  className={cn(
                    "relative z-10 min-h-16 break-words px-4 pt-4 text-sm leading-5 tracking-normal [tab-size:8] placeholder:text-muted-foreground/70 md:text-sm",
                    hasRichTextPrompt &&
                      "caret-foreground text-transparent selection:bg-primary/20 selection:text-transparent"
                  )}
                  aria-label="AI prompt"
                />
              </div>
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools className="flex-wrap">
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger
                    aria-label="Add context"
                    tooltip="Add context"
                    size="icon-sm"
                  >
                    <PlusIcon className="size-4" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent align="start" className="w-60">
                    <PromptInputActionAddAttachments label="Attach files" />
                    <PromptInputActionAddScreenshot label="Take screenshot" />
                    <PromptInputActionMenuItem onSelect={() => openMentions("token")}>
                      <HashIcon className="mr-2 size-4" />
                      Add token
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem onSelect={() => openMentions("theme")}>
                      <SparklesIcon className="mr-2 size-4" />
                      Add theme
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem onSelect={() => openMentions("component")}>
                      <SlidersHorizontalIcon className="mr-2 size-4" />
                      Add component
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem onSelect={() => openMentions("git-file")}>
                      <GitBranchIcon className="mr-2 size-4" />
                      Add changed file
                    </PromptInputActionMenuItem>
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>

                <PromptInputSelect
                  value={contextPreset}
                  onValueChange={handleContextPresetChange}
                >
                  <PromptInputSelectTrigger
                    aria-label="AI context"
                    size="sm"
                    className="gap-2 px-3 text-muted-foreground"
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                    <PromptInputSelectValue>
                      {selectedContextPreset.label}
                    </PromptInputSelectValue>
                    <Badge variant="secondary">{enabledContextCount(context)}</Badge>
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    className="min-w-52"
                  >
                    {CONTEXT_PRESETS.map((preset) => (
                      <PromptInputSelectItem
                        key={preset.value}
                        value={preset.value}
                        onClick={() => handleContextPresetChange(preset.value)}
                      >
                        {preset.label}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              </PromptInputTools>

              <div className="flex items-center gap-1">
                <SpeechInput
                  aria-label="Voice input"
                  className="size-8 bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
                  lang="pt-BR"
                  onTranscriptionChange={handleSpeechTranscription}
                  size="icon-sm"
                  variant="ghost"
                />
                <PromptInputSubmit
                  aria-label="Ask AI"
                  status={isPending ? "submitted" : "ready"}
                  disabled={isPending}
                  size="icon-sm"
                  className="rounded-full"
                >
                  <ArrowUpIcon className="size-4" />
                </PromptInputSubmit>
              </div>
            </PromptInputFooter>
          </PromptInput>

          {commandState.mode && (
            <AiPromptCommandPanel
              commands={filteredCommands}
              mentions={filteredMentions}
              mode={commandState.mode}
              activeIndex={selectedCommandIndex}
              onCommandSelect={handleSlashCommandSelect}
              onMentionSelect={handleMentionSelect}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <GitBranchIcon className="size-4" />
            <span>Workspace local</span>
          </span>

          <PromptInputSelect value={gitScope} onValueChange={handleGitScopeChange}>
            <PromptInputSelectTrigger
              aria-label="Git scope"
              size="sm"
              className="gap-2 bg-transparent px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PromptInputSelectValue>{selectedGitScope.label}</PromptInputSelectValue>
            </PromptInputSelectTrigger>
            <PromptInputSelectContent
              align="end"
              alignItemWithTrigger={false}
              className="min-w-52"
            >
              {gitScopeOptions.map((option) => (
                <PromptInputSelectItem
                  key={option.value}
                  value={option.value}
                  onClick={() => onGitScopeChange(option.value)}
                >
                  {option.label}
                </PromptInputSelectItem>
              ))}
            </PromptInputSelectContent>
          </PromptInputSelect>
        </div>

        {contextOpen && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 md:grid-cols-6">
            {CONTEXT_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center justify-center gap-2 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Checkbox
                  checked={context[key]}
                  onCheckedChange={(checked) =>
                    handleCustomContextChange(key, checked === true)
                  }
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PromptAttachmentPreviewList() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="px-3 pt-3">
      <Attachments variant="inline" className="w-full">
        {attachments.files.map((file) => (
          <Attachment
            data={file}
            key={file.id}
            onRemove={() => attachments.remove(file.id)}
            className="max-w-full bg-muted/50"
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

function PromptRichTextOverlay({
  commands,
  mentions,
  prompt,
}: {
  commands: AiSlashCommand[];
  mentions: AiMentionContext[];
  prompt: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 min-h-16 whitespace-pre-wrap break-words px-4 pt-4 text-sm leading-5 tracking-normal text-foreground [tab-size:8] md:text-sm"
    >
      {renderPromptSegments(prompt, mentions, commands)}
    </div>
  );
}

function AiPromptCommandPanel({
  activeIndex,
  commands,
  mentions,
  mode,
  onCommandSelect,
  onMentionSelect,
}: {
  activeIndex: number;
  commands: AiSlashCommand[];
  mentions: AiMentionContext[];
  mode: "mentions" | "slash";
  onCommandSelect: (command: AiSlashCommand) => void;
  onMentionSelect: (mention: AiMentionContext) => void;
}) {
  const groupedMentions = groupMentionsByKind(mentions);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState({
    canScrollDown: false,
    canScrollUp: false,
  });
  let optionIndex = 0;

  useEffect(() => {
    if (activeIndex < 0) return;

    window.requestAnimationFrame(() => {
      const list = panelRef.current?.querySelector<HTMLElement>(
        '[data-slot="command-list"]'
      );
      const activeItem = panelRef.current?.querySelector<HTMLElement>(
        '[data-ai-command-active="true"]'
      );
      scrollCommandItemIntoView(list, activeItem);
      updateCommandPanelEdges(list, setScrollEdges);
    });
  }, [activeIndex, commands.length, mentions.length, mode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const list = panelRef.current?.querySelector<HTMLElement>(
        '[data-slot="command-list"]'
      );
      updateCommandPanelEdges(list, setScrollEdges);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [commands.length, mentions.length, mode]);

  return (
    <div
      ref={panelRef}
      className="isolate absolute right-0 bottom-[calc(100%+0.625rem)] left-0 z-30 overflow-hidden rounded-3xl border bg-popover text-popover-foreground shadow-[0_22px_55px_-30px_rgba(0,0,0,0.5),0_10px_28px_-24px_rgba(0,0,0,0.35)] [clip-path:inset(0_round_var(--radius-3xl))] contain-paint"
    >
      <PromptInputCommand
        shouldFilter={false}
        className="overflow-hidden rounded-[1.35rem] bg-transparent p-0"
      >
        <div className="relative overflow-hidden rounded-[inherit]">
          <PromptInputCommandList
            className="max-h-80 scroll-py-9 px-1.5 pt-2 pb-8"
            onScroll={(event) =>
              updateCommandPanelEdges(event.currentTarget, setScrollEdges)
            }
          >
            <PromptInputCommandEmpty className="text-muted-foreground">
              {mode === "mentions" ? "No context found." : "No command found."}
            </PromptInputCommandEmpty>

            {mode === "slash" && (
              <PromptInputCommandGroup
                heading="Commands"
                className="**:[[cmdk-group-heading]]:text-muted-foreground"
              >
                {commands.map((command) => {
                  const currentIndex = optionIndex++;
                  const active = currentIndex === activeIndex;

                  return (
                    <PromptInputCommandItem
                      key={command.id}
                      data-ai-command-active={active ? "true" : undefined}
                      onSelect={() => onCommandSelect(command)}
                      value={`${command.label} ${command.description}`}
                      className={cn(
                        "items-start data-selected:bg-muted data-selected:text-foreground",
                        active && "bg-muted text-foreground"
                      )}
                    >
                      <SparklesIcon className="mt-0.5 size-4" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>{command.label}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {command.description}
                        </span>
                      </span>
                    </PromptInputCommandItem>
                  );
                })}
              </PromptInputCommandGroup>
            )}

            {mode === "mentions" &&
              Object.entries(groupedMentions).map(([kind, items]) => (
                <PromptInputCommandGroup
                  key={kind}
                  heading={MENTION_GROUP_LABELS[kind as AiMentionKind]}
                  className="**:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {items.map((mention) => {
                    const currentIndex = optionIndex++;
                    const active = currentIndex === activeIndex;

                    return (
                      <PromptInputCommandItem
                        key={mention.id}
                        data-ai-command-active={active ? "true" : undefined}
                        onSelect={() => onMentionSelect(mention)}
                        value={`${mention.label} ${mention.description} ${mention.path ?? ""}`}
                        className={cn(
                          "items-start data-selected:bg-muted data-selected:text-foreground",
                          active && "bg-muted text-foreground"
                        )}
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] uppercase text-muted-foreground">
                          {mention.kind.slice(0, 1)}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{mention.label}</span>
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {mention.description}
                          </span>
                        </span>
                      </PromptInputCommandItem>
                    );
                  })}
                </PromptInputCommandGroup>
              ))}
          </PromptInputCommandList>
          {scrollEdges.canScrollUp && (
            <FrostedEdgeBlur position="top" />
          )}
          {scrollEdges.canScrollDown && (
            <FrostedEdgeBlur position="bottom" />
          )}
        </div>
      </PromptInputCommand>
    </div>
  );
}

function updateCommandPanelEdges(
  list: HTMLElement | null | undefined,
  setScrollEdges: (value: (current: { canScrollDown: boolean; canScrollUp: boolean }) => {
    canScrollDown: boolean;
    canScrollUp: boolean;
  }) => void
) {
  if (!list) return;

  const nextCanScrollUp = list.scrollTop > 2;
  const nextCanScrollDown =
    list.scrollTop + list.clientHeight < list.scrollHeight - 2;

  setScrollEdges((current) =>
    current.canScrollUp === nextCanScrollUp &&
    current.canScrollDown === nextCanScrollDown
      ? current
      : {
          canScrollDown: nextCanScrollDown,
          canScrollUp: nextCanScrollUp,
        }
  );
}

function scrollCommandItemIntoView(
  list: HTMLElement | null | undefined,
  item: HTMLElement | null | undefined
) {
  if (!list || !item) return;

  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const topLimit = listRect.top + COMMAND_PANEL_SCROLL_MARGIN;
  const bottomLimit = listRect.bottom - COMMAND_PANEL_SCROLL_MARGIN;

  if (itemRect.top < topLimit) {
    list.scrollTop -= topLimit - itemRect.top;
    return;
  }

  if (itemRect.bottom > bottomLimit) {
    list.scrollTop += itemRect.bottom - bottomLimit;
  }
}

function enabledContextCount(context: AiTaskContext): number {
  return CONTEXT_KEYS.filter((key) => context[key]).length;
}

function normalizeContextPresetValue(value: unknown): ContextPresetValue | undefined {
  const rawValue =
    typeof value === "string"
      ? value
      : typeof value === "object" &&
          value !== null &&
          "value" in value &&
          typeof value.value === "string"
        ? value.value
        : undefined;

  return CONTEXT_PRESETS.some((preset) => preset.value === rawValue)
    ? (rawValue as ContextPresetValue)
    : undefined;
}

function normalizeGitScope(value: unknown): AiGitScope | undefined {
  const rawValue = normalizeStringValue(value);
  return ["current-branch", "changed-files", "semantic-diff", "none"].includes(rawValue ?? "")
    ? (rawValue as AiGitScope)
    : undefined;
}

function normalizeStringValue(value: unknown) {
  return typeof value === "string"
    ? value
    : typeof value === "object" &&
        value !== null &&
        "value" in value &&
        typeof value.value === "string"
      ? value.value
      : undefined;
}

function getGitScopeOptions(git: GitStatusSummary) {
  if (!git.available) {
    return [
      { value: "none" as const, label: "No Git" },
      { value: "current-branch" as const, label: "Current branch" },
      { value: "changed-files" as const, label: "Changed files" },
      { value: "semantic-diff" as const, label: "Semantic diff" },
    ];
  }

  return [
    { value: "current-branch" as const, label: git.branch || "Current branch" },
    { value: "changed-files" as const, label: `${git.files.length} changed files` },
    { value: "semantic-diff" as const, label: "Semantic diff" },
    { value: "none" as const, label: "No Git" },
  ];
}

function detectPromptCommand(prompt: string, cursor = prompt.length): CommandState {
  const beforeCursor = prompt.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)([@/])([^\s]*)$/);
  if (!match) return { mode: null, query: "" };
  const token = match[0];
  const leadingSpace = token.startsWith(" ") ? 1 : 0;
  const start = cursor - token.length + leadingSpace;
  const end = cursor;
  return match[1] === "@"
    ? { mode: "mentions", query: match[2] ?? "", start, end }
    : { mode: "slash", query: match[2] ?? "", start, end };
}

function replaceCommandRange(
  prompt: string,
  commandState: CommandState,
  insertion: string,
  fallbackCursor: number
) {
  const start = commandState.mode === null ? undefined : commandState.start;
  const end = commandState.mode === null ? undefined : commandState.end;
  const rangeStart = start ?? fallbackCursor;
  const rangeEnd = end ?? fallbackCursor;
  const prefix = prompt.slice(0, rangeStart);
  const suffix = prompt.slice(rangeEnd);
  const spacer = prefix && !/\s$/.test(prefix) ? " " : "";
  const nextValue = `${prefix}${spacer}${insertion}${suffix}`;
  const cursor = prefix.length + spacer.length + insertion.length;
  return { nextValue, cursor };
}

function deleteInlinePromptElement({
  commands,
  key,
  mentions,
  prompt,
  selectionEnd,
  selectionStart,
}: {
  commands: AiSlashCommand[];
  key: "Backspace" | "Delete";
  mentions: AiMentionContext[];
  prompt: string;
  selectionEnd: number;
  selectionStart: number;
}) {
  if (selectionStart !== selectionEnd) return null;

  const ranges = mergePromptRanges([
    ...findMentionRanges(prompt, mentions).map(
      (range): PromptRenderRange => ({ ...range, kind: "mention" })
    ),
    ...findSlashCommandRanges(prompt, commands).map(
      (range): PromptRenderRange => ({ ...range, kind: "slash" })
    ),
  ]);
  const cursor = selectionStart;
  const range = ranges.find((item) => {
    if (key === "Backspace") {
      return (
        (cursor > item.start && cursor <= item.end) ||
        (cursor === item.end + 1 && prompt[item.end] === " ")
      );
    }

    return (
      (cursor >= item.start && cursor < item.end) ||
      (cursor === item.start - 1 && prompt[cursor] === " ")
    );
  });

  if (!range) return null;

  const deleteStart =
    key === "Delete" && cursor === range.start - 1 && prompt[cursor] === " "
      ? cursor
      : range.start;
  const deleteEnd =
    key === "Backspace" && cursor === range.end + 1 && prompt[range.end] === " "
      ? cursor
      : range.end;
  const nextValue = `${prompt.slice(0, deleteStart)}${prompt.slice(deleteEnd)}`;

  return {
    cursor: deleteStart,
    nextValue,
  };
}

function formatInlineMention(mention: AiMentionContext) {
  if (/^[A-Za-z0-9_.:/-]+$/.test(mention.label)) {
    return `@${mention.label}`;
  }
  return `@"${mention.label.replaceAll('"', '\\"')}"`;
}

function formatInlineCommand(command: AiSlashCommand) {
  return `/${command.id}`;
}

function reconcileMentionsFromPrompt(
  prompt: string,
  mentionOptions: AiMentionContext[],
  existingMentions: AiMentionContext[]
) {
  const labels = extractInlineMentionLabels(prompt);
  if (labels.size === 0) return [];

  const candidates = new Map<string, AiMentionContext>();
  for (const mention of [...existingMentions, ...mentionOptions]) {
    candidates.set(mention.id, mention);
  }

  return Array.from(candidates.values()).filter((mention) => labels.has(mention.label));
}

function extractInlineMentionLabels(prompt: string) {
  const labels = new Set<string>();
  const matcher = /@"((?:\\"|[^"])*)"|@([^\s@/]+)/g;
  for (const match of prompt.matchAll(matcher)) {
    const quoted = match[1]?.replaceAll('\\"', '"');
    const plain = match[2];
    if (quoted) labels.add(quoted);
    if (plain) labels.add(plain);
  }
  return labels;
}

function findInlineSlashCommand(prompt: string, commands: AiSlashCommand[]) {
  const matcher = /(?:^|\s)\/([a-z0-9-]+)/g;
  for (const match of prompt.matchAll(matcher)) {
    const command = commands.find((item) => item.id === match[1]);
    if (command) return command;
  }
  return undefined;
}

function filterMentionOptions(
  mentions: AiMentionContext[],
  query: string,
  kind?: AiMentionKind
) {
  const normalizedQuery = query.trim().toLowerCase();
  return mentions.filter((mention) => {
    if (kind && mention.kind !== kind) return false;
    if (!normalizedQuery) return true;
    return [mention.label, mention.description, mention.path ?? "", mention.kind]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function filterSlashCommands(commands: AiSlashCommand[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return commands;
  return commands.filter((command) =>
    [command.id, command.label, command.description]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function groupMentionsByKind(mentions: AiMentionContext[]) {
  return mentions.reduce(
    (groups, mention) => {
      groups[mention.kind] ??= [];
      groups[mention.kind].push(mention);
      return groups;
    },
    {} as Record<AiMentionKind, AiMentionContext[]>
  );
}

type PromptRenderRange =
  | {
      kind: "mention";
      start: number;
      end: number;
      mention: AiMentionContext;
      token: string;
    }
  | {
      kind: "slash";
      start: number;
      end: number;
      command: AiSlashCommand;
      token: string;
    };

function renderPromptSegments(
  prompt: string,
  mentions: AiMentionContext[],
  commands: AiSlashCommand[]
) {
  const ranges = mergePromptRanges([
    ...findMentionRanges(prompt, mentions).map(
      (range): PromptRenderRange => ({ ...range, kind: "mention" })
    ),
    ...findSlashCommandRanges(prompt, commands).map(
      (range): PromptRenderRange => ({ ...range, kind: "slash" })
    ),
  ]);

  if (ranges.length === 0) return prompt;

  const segments: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      segments.push(prompt.slice(cursor, range.start));
    }

    if (range.kind === "mention") {
      segments.push(
        <span
          key={`${range.mention.id}:${range.start}:${index}`}
          className="rounded-[0.35rem] bg-blue-500/15 text-blue-600 shadow-[0_0_0_3px_rgb(59_130_246_/_0.12)] box-decoration-clone"
        >
          {range.token}
        </span>
      );
    } else {
      segments.push(
        <span
          key={`${range.command.id}:${range.start}:${index}`}
          className="rounded-[0.35rem] bg-violet-500/15 text-violet-700 shadow-[0_0_0_3px_rgb(139_92_246_/_0.12)] box-decoration-clone dark:text-violet-300"
        >
          {range.token}
        </span>
      );
    }

    cursor = range.end;
  });
  if (cursor < prompt.length) segments.push(prompt.slice(cursor));
  return segments;
}

function mergePromptRanges(ranges: PromptRenderRange[]) {
  const sortedRanges = [...ranges].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
  const mergedRanges: PromptRenderRange[] = [];

  for (const range of sortedRanges) {
    if (mergedRanges.some((existing) => range.start < existing.end && range.end > existing.start)) {
      continue;
    }
    mergedRanges.push(range);
  }

  return mergedRanges;
}

function findMentionRanges(prompt: string, mentions: AiMentionContext[]) {
  const sortedMentions = [...mentions].sort((a, b) => b.label.length - a.label.length);
  const ranges: Array<{ start: number; end: number; mention: AiMentionContext; token: string }> = [];

  for (const mention of sortedMentions) {
    for (const token of [formatInlineMention(mention), `@"${mention.label.replaceAll('"', '\\"')}"`]) {
      let start = prompt.indexOf(token);
      while (start !== -1) {
        const end = start + token.length;
        if (!ranges.some((range) => start < range.end && end > range.start)) {
          ranges.push({ start, end, mention, token });
        }
        start = prompt.indexOf(token, end);
      }
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function findSlashCommandRanges(prompt: string, commands: AiSlashCommand[]) {
  const ranges: Array<{ start: number; end: number; command: AiSlashCommand; token: string }> = [];

  for (const command of commands) {
    const token = formatInlineCommand(command);
    let start = prompt.indexOf(token);
    while (start !== -1) {
      const end = start + token.length;
      const before = start === 0 ? "" : prompt[start - 1];
      const after = end >= prompt.length ? "" : prompt[end];
      const hasBoundaryBefore = start === 0 || /\s/.test(before);
      const hasBoundaryAfter = end === prompt.length || /\s/.test(after);

      if (hasBoundaryBefore && hasBoundaryAfter) {
        ranges.push({ start, end, command, token });
      }

      start = prompt.indexOf(token, end);
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function toAttachmentContexts(files: FileUIPart[]): AiAttachmentContext[] {
  return files.map((file, index) => {
    const name = file.filename || `attachment-${index + 1}`;
    const mimeType = file.mediaType || "application/octet-stream";
    return {
      id: `${name}-${index}`,
      name,
      mimeType,
      size: estimateDataUrlSize(file.url),
      textPreview: getAttachmentTextPreview(file),
    };
  });
}

function getAttachmentTextPreview(file: FileUIPart) {
  const name = file.filename || "attachment";
  const mimeType = file.mediaType || "";
  if (!isTextAttachment(name, mimeType)) {
    return `[${mimeType || "binary"} attachment: ${name}]`;
  }

  const decoded = decodeDataUrl(file.url);
  return truncateText(decoded || `[text attachment: ${name}]`, 2_000);
}

function isTextAttachment(name: string, mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    /\.(css|csv|json|md|txt|ts|tsx|js|jsx|xml|yaml|yml)$/i.test(name)
  );
}

function decodeDataUrl(url: string) {
  if (!url.startsWith("data:")) return "";
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return "";
  const meta = url.slice(0, commaIndex);
  const body = url.slice(commaIndex + 1);

  try {
    if (meta.includes(";base64")) {
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return "";
  }
}

function estimateDataUrlSize(url: string) {
  if (!url.startsWith("data:")) return 0;
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return 0;
  const body = url.slice(commaIndex + 1);
  return Math.round((body.length * 3) / 4);
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
