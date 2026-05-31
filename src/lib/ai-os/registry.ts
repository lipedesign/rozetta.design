import { formatTokenValue } from "@/lib/dtcg/format";
import { flattenTokens, getNodeAtPath } from "@/lib/dtcg/parser";
import { setTokenAtPath } from "@/lib/dtcg/serializer";
import { isDtcgToken, type DtcgGroup, type DtcgToken, type TokenSet } from "@/lib/dtcg/types";
import { AiPatchProposalSchema } from "@/lib/ai-os/contract/proposal-schema";
import { zodErrorToHuman } from "@/lib/ai-os/contract/zod-utils";
import {
  normalizeBrands,
  normalizeComponents,
  resolveBrandPackage,
} from "@/lib/design-system/registry";
import { normalizeThemes } from "@/lib/themes/registry";
import type { Theme } from "@/lib/themes/types";
import { diffTokenSets } from "@/lib/workspace/diff";
import { normalizeExportProfiles } from "@/lib/workspace/export-profiles";
import { generateReleaseDraft } from "@/lib/workspace/releases";
import type {
  AiApplyResult,
  AiCommandInput,
  AiConversation,
  AiConversationMessage,
  AiCommandSession,
  AiMentionContext,
  AiPatchOperation,
  AiPatchProposal,
  AiProviderConfig,
  AiReadOnlyToolCall,
  AiReasoningStep,
  AiReviewResult,
  AiSettings,
  AiSlashCommand,
  AiTaskContext,
  AiWorkspaceContext,
  AiWorkspaceDraft,
  Brand,
  DesignSystemComponent,
  DesignSystemRegistryInput,
  ExportProfile,
  SyncConnector,
  ValidationIssue,
} from "@/lib/workspace/types";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";

export const DEFAULT_AI_CONTEXT: AiTaskContext = {
  sets: true,
  themes: true,
  brands: true,
  components: true,
  releases: true,
  git: true,
};

const AI_CONVERSATION_ID = "rozetta-ai-active-conversation";
const AI_CONVERSATION_TITLE = "Rozetta AI";
const AI_CONVERSATION_LIMIT = 100;

export function createDefaultAiConversation(now = new Date().toISOString()): AiConversation {
  return {
    id: AI_CONVERSATION_ID,
    title: AI_CONVERSATION_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeAiConversation(value: unknown): AiConversation {
  const now = new Date().toISOString();
  if (!value || typeof value !== "object") return createDefaultAiConversation(now);
  const input = value as Partial<AiConversation>;
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : now;
  const messages = Array.isArray(input.messages)
    ? input.messages
        .filter(isAiConversationMessage)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-AI_CONVERSATION_LIMIT)
    : [];

  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id : AI_CONVERSATION_ID,
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title
        : AI_CONVERSATION_TITLE,
    messages,
    createdAt,
    updatedAt:
      typeof input.updatedAt === "string"
        ? input.updatedAt
        : messages.at(-1)?.createdAt ?? createdAt,
  };
}

export function appendAiConversationMessages(
  conversation: AiConversation,
  messages: AiConversationMessage[],
  limit = AI_CONVERSATION_LIMIT
): AiConversation {
  const normalized = normalizeAiConversation(conversation);
  const nextMessages = [...normalized.messages, ...messages]
    .filter(isAiConversationMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit);
  return {
    ...normalized,
    messages: nextMessages,
    updatedAt: nextMessages.at(-1)?.createdAt ?? normalized.updatedAt,
  };
}

export function createUserConversationMessage(input: {
  command: AiCommandInput;
  now?: string;
}): AiConversationMessage {
  const now = input.now ?? new Date().toISOString();
  return {
    id: conversationMessageId("user", now, input.command.prompt),
    role: "user",
    content: input.command.prompt.trim() || "Use the selected assistant action.",
    createdAt: now,
    status: "ready",
    taskKind: input.command.kind,
    context: input.command.context,
    mentions: input.command.mentions ?? [],
    attachments: input.command.attachments ?? [],
  };
}

export function createAssistantConversationMessage(input: {
  command: AiCommandInput;
  proposal: AiPatchProposal;
  patchQueued: boolean;
  reasoningSteps?: AiReasoningStep[];
  toolCalls?: AiReadOnlyToolCall[];
  now?: string;
}): AiConversationMessage {
  const now = input.now ?? new Date().toISOString();
  return {
    id: conversationMessageId("assistant", now, input.proposal.id),
    role: "assistant",
    content: assistantMessageContent(input.proposal, input.patchQueued),
    createdAt: now,
    status: "ready",
    taskKind: input.command.kind,
    context: input.command.context,
    mentions: input.command.mentions ?? [],
    attachments: input.command.attachments ?? [],
    toolCalls: input.toolCalls ?? [],
    reasoningSteps: input.reasoningSteps ?? [],
    patchId: input.patchQueued ? input.proposal.id : undefined,
    providerKind: input.proposal.source.providerKind,
    modelId: input.proposal.source.modelId,
  };
}

export function shouldQueueAiProposal(proposal: AiPatchProposal): boolean {
  return proposal.operations.length > 0;
}

export function createDefaultAiSettings(now = new Date().toISOString()): AiSettings {
  return {
    version: "rozetta-ai-settings/v1",
    activeProviderId: "deterministic",
    updatedAt: now,
    providers: [
      {
        id: "deterministic",
        kind: "deterministic",
        label: "Deterministic fallback",
        enabled: true,
        model: { id: "rozetta-deterministic-v1", label: "Rozetta deterministic v1" },
        hasApiKey: false,
        updatedAt: now,
      },
      {
        id: "openai",
        kind: "openai",
        label: "OpenAI",
        enabled: false,
        model: { id: "gpt-5.4", label: "GPT-5.4" },
        hasApiKey: false,
        updatedAt: now,
      },
      {
        id: "anthropic",
        kind: "anthropic",
        label: "Anthropic",
        enabled: false,
        model: { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
        hasApiKey: false,
        updatedAt: now,
      },
      {
        id: "claude-code-local",
        kind: "claude-code-local",
        label: "Claude Code (local)",
        enabled: false,
        model: { id: "claude-code-default", label: "Local Claude Code" },
        hasApiKey: false,
        updatedAt: now,
      },
      {
        id: "codex-local",
        kind: "codex-local",
        label: "Codex (local)",
        enabled: false,
        model: { id: "codex-default", label: "Local Codex" },
        hasApiKey: false,
        updatedAt: now,
      },
    ],
  };
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const fallback = createDefaultAiSettings();
  if (!value || typeof value !== "object") return fallback;

  const input = value as Partial<AiSettings>;
  const incomingProviders = Array.isArray(input.providers) ? input.providers : [];
  const defaultsById = new Map(fallback.providers.map((provider) => [provider.id, provider]));
  const normalizedProviders = fallback.providers.map((defaultProvider) => {
    const incoming = incomingProviders.find(
      (provider) =>
        Boolean(provider) &&
        typeof provider === "object" &&
        "id" in provider &&
        provider.id === defaultProvider.id
    ) as Partial<AiProviderConfig> | undefined;
    const apiKey = typeof incoming?.apiKey === "string" ? incoming.apiKey : undefined;
    const executablePath =
      typeof incoming?.executablePath === "string" ? incoming.executablePath : undefined;
    return {
      ...defaultProvider,
      ...incoming,
      id: defaultProvider.id,
      kind: defaultProvider.kind,
      label: typeof incoming?.label === "string" ? incoming.label : defaultProvider.label,
      model: {
        id: incoming?.model?.id || defaultProvider.model.id,
        label: incoming?.model?.label || incoming?.model?.id || defaultProvider.model.label,
      },
      enabled: typeof incoming?.enabled === "boolean" ? incoming.enabled : defaultProvider.enabled,
      apiKey,
      hasApiKey: Boolean(apiKey || incoming?.hasApiKey),
      executablePath,
      updatedAt: incoming?.updatedAt || defaultProvider.updatedAt,
    } satisfies AiProviderConfig;
  });

  for (const provider of incomingProviders) {
    if (!provider || typeof provider !== "object" || typeof provider.id !== "string") continue;
    if (defaultsById.has(provider.id)) continue;
    if (
      !["deterministic", "openai", "anthropic", "claude-code-local", "codex-local"].includes(
        String(provider.kind)
      )
    )
      continue;
    const apiKey = typeof provider.apiKey === "string" ? provider.apiKey : undefined;
    const executablePath =
      typeof provider.executablePath === "string" ? provider.executablePath : undefined;
    normalizedProviders.push({
      id: provider.id,
      kind: provider.kind,
      label: provider.label || provider.id,
      enabled: Boolean(provider.enabled),
      model: {
        id: provider.model?.id || "unknown",
        label: provider.model?.label || provider.model?.id || "Unknown",
      },
      hasApiKey: Boolean(apiKey || provider.hasApiKey),
      apiKey,
      baseUrl: provider.baseUrl,
      executablePath,
      updatedAt: provider.updatedAt || fallback.updatedAt,
    });
  }

  const activeProviderId =
    typeof input.activeProviderId === "string" &&
    normalizedProviders.some((provider) => provider.id === input.activeProviderId)
      ? input.activeProviderId
      : "deterministic";

  return {
    version: "rozetta-ai-settings/v1",
    activeProviderId,
    providers: normalizedProviders,
    updatedAt: input.updatedAt || fallback.updatedAt,
  };
}

export function redactAiSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      const hasApiKey = Boolean(provider.apiKey || provider.hasApiKey);
      const redacted = { ...provider, hasApiKey };
      delete redacted.apiKey;
      return { ...redacted, hasApiKey };
    }),
  };
}

export function mergeAiSettings(existing: AiSettings, incoming: AiSettings): AiSettings {
  const now = new Date().toISOString();
  const existingById = new Map(existing.providers.map((provider) => [provider.id, provider]));
  const merged = normalizeAiSettings(incoming);
  return {
    ...merged,
    updatedAt: now,
    providers: merged.providers.map((provider) => {
      const previous = existingById.get(provider.id);
      const apiKey =
        provider.apiKey === ""
          ? undefined
          : provider.apiKey !== undefined
            ? provider.apiKey
            : previous?.apiKey;
      return {
        ...provider,
        apiKey,
        hasApiKey: Boolean(apiKey),
        updatedAt: now,
      };
    }),
  };
}

export function buildAiWorkspaceContext(input: {
  sets: TokenSet[];
  baselineSets?: TokenSet[];
  themes: Theme[];
  brands: Brand[];
  components: DesignSystemComponent[];
  exportProfiles: ExportProfile[];
  git?: AiCommandInput["workspace"]["git"];
  operational?: AiCommandInput["workspace"]["operational"];
  focus?: Partial<AiTaskContext>;
  baselineDesignSystem?: DesignSystemRegistryInput;
}): AiWorkspaceContext {
  const focus = { ...DEFAULT_AI_CONTEXT, ...input.focus };
  const health = buildWorkspaceHealth({
    sets: input.sets,
    themes: input.themes,
    exportProfiles: input.exportProfiles,
    brands: input.brands,
    components: input.components,
    git: input.git,
  });
  const semanticDiff =
    input.baselineSets && input.baselineSets.length > 0
      ? diffTokenSets(input.baselineSets, input.sets)
      : undefined;

  return {
    generatedAt: new Date().toISOString(),
    focus,
    health,
    semanticDiff,
    operational: input.operational,
    releaseDraft: semanticDiff ? generateReleaseDraft(semanticDiff, "patch") : undefined,
  };
}

export function listAiSlashCommands(): AiSlashCommand[] {
  return [
    {
      id: "audit-workspace",
      label: "Audit workspace",
      description: "Find issues, drift, invalid values, and risky design system gaps.",
      taskKind: "explain-issues",
      defaultPrompt: "Audit this workspace and explain the most important design system issues.",
    },
    {
      id: "propose-fixes",
      label: "Propose fixes",
      description: "Create safe suggestions that stay in the review queue.",
      taskKind: "propose-fixes",
      defaultPrompt: "Review the workspace and propose safe fixes I can apply after review.",
    },
    {
      id: "release-notes",
      label: "Release notes",
      description: "Draft notes from the current semantic diff.",
      taskKind: "release-notes",
      defaultPrompt: "Generate release notes from the current design system changes.",
    },
    {
      id: "improve-naming",
      label: "Improve naming",
      description: "Suggest clearer token, brand, and component names.",
      taskKind: "suggest-names",
      defaultPrompt: "Suggest clearer token and design system naming improvements.",
    },
    {
      id: "ask-workspace",
      label: "Ask workspace",
      description: "Answer a question using the selected workspace context.",
      taskKind: "workspace-question",
      defaultPrompt: "Answer my question using the current workspace context.",
    },
    {
      id: "design-system-proposal",
      label: "Design System proposal",
      description: "Review brands, components, and token structure together.",
      taskKind: "design-system",
      defaultPrompt:
        "Review the design system registry and propose useful brand or component improvements.",
    },
    {
      id: "validate-workspace",
      label: "Validate workspace",
      description: "Run read-only validation and explain the result.",
      taskKind: "explain-issues",
      defaultPrompt: "Validate this workspace and explain the highest priority issues.",
    },
    {
      id: "semantic-diff",
      label: "Semantic diff",
      description: "Summarize token changes against the saved baseline.",
      taskKind: "workspace-question",
      defaultPrompt: "Summarize the current semantic diff and call out important changes.",
    },
    {
      id: "export-preview",
      label: "Export preview",
      description: "Inspect export profiles and expected artifacts without writing files.",
      taskKind: "workspace-question",
      defaultPrompt: "Preview the current export profile status and expected artifacts.",
    },
  ];
}

export function searchAiMentions(
  workspace: AiCommandInput["workspace"],
  query = ""
): AiMentionContext[] {
  const normalizedQuery = query.trim().toLowerCase();
  const mentions: AiMentionContext[] = [];

  for (const set of workspace.sets) {
    for (const token of flattenTokens(set)) {
      mentions.push({
        id: `token:${set.id}:${token.path}`,
        kind: "token",
        label: token.path,
        description: `${set.name} · ${token.$type}`,
        path: `${set.name}/${token.path}`,
        payloadPreview: formatTokenValue(token.$value, token.$type),
      });
    }
  }

  for (const theme of workspace.themes) {
    mentions.push({
      id: `theme:${theme.id}`,
      kind: "theme",
      label: theme.name,
      description: `${theme.sets.length} linked set${theme.sets.length === 1 ? "" : "s"}`,
      path: `themes/${theme.id}`,
      payloadPreview: JSON.stringify(
        { sets: theme.sets.map((set) => `${set.setId}:${set.mode}`) },
        null,
        2
      ),
    });
  }

  for (const brand of workspace.brands) {
    mentions.push({
      id: `brand:${brand.id}`,
      kind: "brand",
      label: brand.name,
      description: `${brand.status} · ${brand.slug}`,
      path: `brands/${brand.slug}`,
      payloadPreview: JSON.stringify(
        {
          status: brand.status,
          tokenSetIds: brand.tokenSetIds,
          themeIds: brand.themeIds,
          componentIds: brand.componentIds,
        },
        null,
        2
      ),
    });
  }

  for (const component of workspace.components) {
    mentions.push({
      id: `component:${component.id}`,
      kind: "component",
      label: component.name,
      description: `${component.status} · ${component.category}`,
      path: `components/${component.slug}`,
      payloadPreview: JSON.stringify(
        {
          status: component.status,
          tokenRefs: component.tokenRefs,
          variants: component.variants.map((variant) => variant.name),
        },
        null,
        2
      ),
    });
  }

  if (workspace.baselineSets && workspace.baselineSets.length > 0) {
    const semanticDiff = diffTokenSets(workspace.baselineSets, workspace.sets);
    const draft = generateReleaseDraft(semanticDiff, "patch");
    mentions.push({
      id: "release:current-draft",
      kind: "release",
      label: draft.title,
      description: draft.summary,
      path: "releases/current-draft",
      payloadPreview: draft.notes.slice(0, 800),
    });
  }

  for (const file of workspace.git?.files ?? []) {
    mentions.push({
      id: `git-file:${file.path}`,
      kind: "git-file",
      label: file.path,
      description: `${file.kind} · index ${file.indexStatus || "-"} · worktree ${
        file.worktreeStatus || "-"
      }`,
      path: file.path,
      payloadPreview: JSON.stringify(file, null, 2),
    });
  }

  return mentions
    .filter((mention) => mentionMatchesQuery(mention, normalizedQuery))
    .slice(0, 80);
}

export function resolveAiMentionContext(
  mention: AiMentionContext,
  workspace: AiCommandInput["workspace"]
): AiMentionContext {
  return searchAiMentions(workspace).find((candidate) => candidate.id === mention.id) ?? mention;
}

export function buildAiToolCalls(
  input: AiCommandInput,
  workspace = input.workspace
): AiReadOnlyToolCall[] {
  const git = input.gitScope === "none" ? undefined : workspace.git;
  const health = buildWorkspaceHealth({
    sets: workspace.sets,
    themes: workspace.themes,
    exportProfiles: workspace.exportProfiles,
    brands: workspace.brands,
    components: workspace.components,
    git,
  });
  const calls: AiReadOnlyToolCall[] = [
    {
      id: "tool:validate-workspace",
      name: "validate_workspace",
      title: "Validate workspace",
      state: "output-available",
      input: { focus: input.context },
      output: {
        summary: health.summary,
        issues: health.issues.slice(0, 8),
      },
    },
  ];

  if (workspace.baselineSets && workspace.baselineSets.length > 0) {
    const semanticDiff = diffTokenSets(workspace.baselineSets, workspace.sets);
    calls.push({
      id: "tool:semantic-diff",
      name: "semantic_diff",
      title: "Semantic diff",
      state: "output-available",
      input: { baselineSets: workspace.baselineSets.length, currentSets: workspace.sets.length },
      output: {
        summary: semanticDiff.summary,
        changes: semanticDiff.changes.slice(0, 10),
      },
    });
  }

  if (input.mentions && input.mentions.length > 0) {
    calls.push({
      id: "tool:resolve-context",
      name: "resolve_context",
      title: "Resolve context",
      state: "output-available",
      input: { mentionIds: input.mentions.map((mention) => mention.id) },
      output: input.mentions.map((mention) => resolveAiMentionContext(mention, workspace)),
    });
  }

  if (input.slashCommandId === "export-preview") {
    calls.push({
      id: "tool:preview-export",
      name: "preview_export",
      title: "Preview export",
      state: "output-available",
      input: { profiles: workspace.exportProfiles.length },
      output: workspace.exportProfiles.slice(0, 8).map((profile) => ({
        id: profile.id,
        name: profile.name,
        targetKind: profile.targetKind,
        targetId: profile.targetId,
        format: profile.format,
        destination: profile.destination,
      })),
    });
  }

  return calls;
}

export function buildAiReasoningSteps(
  input: AiCommandInput,
  proposal?: AiPatchProposal
): AiReasoningStep[] {
  const enabledContext = Object.entries(input.context)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const tools = buildAiToolCalls(input);

  return [
    {
      title: "Read prompt",
      description:
        input.prompt.trim() ||
        listAiSlashCommands().find((command) => command.id === input.slashCommandId)
          ?.defaultPrompt ||
        "Use selected workspace context.",
      status: "complete",
    },
    {
      title: "Resolve context",
      description: `${enabledContext.join(", ")}${
        input.mentions?.length ? ` · ${input.mentions.length} mention(s)` : ""
      }${input.attachments?.length ? ` · ${input.attachments.length} attachment(s)` : ""}`,
      status: "complete",
    },
    {
      title: "Run read-only tools",
      description: tools.map((tool) => tool.name).join(", "),
      status: "complete",
    },
    {
      title: "Prepare reviewable output",
      description: proposal
        ? `${proposal.operations.length} operation(s) queued for review.`
        : "No operation has been queued yet.",
      status: "complete",
    },
  ];
}

export function createDeterministicAiProposal(input: AiCommandInput): AiPatchProposal {
  const context = buildAiWorkspaceContext({
    ...input.workspace,
    focus: input.context,
    git: input.gitScope === "none" ? undefined : input.workspace.git,
  });
  const provider = {
    providerKind: "deterministic" as const,
    modelId: "rozetta-deterministic-v1",
  };
  const operations = createDeterministicOperations(input, context);
  const now = new Date().toISOString();

  return {
    id: `ai-patch-${now.replace(/[^0-9]/g, "")}-${slugify(input.kind)}`,
    title: titleForTask(input.kind),
    summary: summaryForTask(input, context, operations),
    status: "pending",
    operations,
    source: {
      taskKind: input.kind,
      ...provider,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createModelAiProposal(input: {
  baseProposal: AiPatchProposal;
  provider: Pick<AiProviderConfig, "kind" | "model">;
  modelText: string;
}): AiPatchProposal {
  const now = new Date().toISOString();
  const note = input.modelText.trim();
  const shouldAddReviewNote =
    input.baseProposal.operations.length > 0 ||
    input.baseProposal.source.taskKind === "release-notes" ||
    input.baseProposal.source.taskKind === "suggest-names";
  return {
    ...input.baseProposal,
    id: `${input.baseProposal.id}-model`,
    title: `${input.baseProposal.title} · model-assisted`,
    summary: note.trim() || input.baseProposal.summary,
    status: "pending",
    operations: shouldAddReviewNote
      ? [
          ...input.baseProposal.operations,
          {
            type: "release-note.generate",
            notes: note || input.baseProposal.summary,
          },
        ]
      : input.baseProposal.operations,
    source: {
      taskKind: input.baseProposal.source.taskKind,
      providerKind: input.provider.kind,
      modelId: input.provider.model.id,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function validateAiPatch(
  proposal: AiPatchProposal,
  workspace: AiWorkspaceDraft
): AiReviewResult {
  const parsed = AiPatchProposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [
        {
          id: `ai-patch-schema:${(proposal as { id?: unknown } | null)?.id ?? "unknown"}`,
          severity: "error",
          source: { kind: "workspace" },
          title: "Patch failed schema validation",
          detail: zodErrorToHuman(parsed.error),
          action: "Reject the proposal or ask AI to regenerate with the required shape.",
        },
      ],
      previewLines: [],
    };
  }

  const validated = parsed.data;
  const issues: ValidationIssue[] = [];
  const previewLines: string[] = [];
  const setIds = new Set(workspace.sets.map((set) => set.id));
  const themeIds = new Set(workspace.themes.map((theme) => theme.id));
  const brandIds = new Set(workspace.brands.map((brand) => brand.id));
  const componentIds = new Set(workspace.components.map((component) => component.id));

  for (const [index, operation] of validated.operations.entries()) {
    previewLines.push(previewOperation(operation));
    if (operation.type === "token.patch") {
      const set = workspace.sets.find((item) => item.id === operation.setId);
      const node = set ? getNodeAtPath(set.root, operation.path) : undefined;
      if (!set || !isDtcgToken(node)) {
        issues.push(patchIssue(validated.id, index, "error", "Token target is missing", operation.path));
      }
    }
    if (operation.type === "theme.upsert" && !operation.theme.id.trim()) {
      issues.push(patchIssue(validated.id, index, "error", "Theme patch has no id", operation.theme.name));
    }
    if (operation.type === "brand.upsert" && !operation.brand.id.trim()) {
      issues.push(patchIssue(validated.id, index, "error", "Brand patch has no id", operation.brand.name));
    }
    if (operation.type === "component.upsert" && !operation.component.id.trim()) {
      issues.push(patchIssue(validated.id, index, "error", "Component patch has no id", operation.component.name));
    }
    if (operation.type === "export-profile.upsert") {
      const validTarget =
        operation.profile.targetKind === "set"
          ? setIds.has(operation.profile.targetId)
          : themeIds.has(operation.profile.targetId);
      if (!validTarget) {
        issues.push(
          patchIssue(
            validated.id,
            index,
            "warning",
            "Export profile target is missing",
            operation.profile.targetId
          )
        );
      }
    }
  }

  if (validated.operations.length === 0) {
    issues.push({
      id: `ai-patch-empty:${validated.id}`,
      severity: "info",
      source: { kind: "workspace" },
      title: "Patch has no operations",
      detail: "The proposal is explanatory only.",
      action: "Use it as guidance or ask AI for a more specific patch.",
    });
  }

  for (const brand of workspace.brands) {
    if (brand.baseBrandId && !brandIds.has(brand.baseBrandId)) continue;
  }
  for (const component of workspace.components) {
    for (const brandId of component.brandIds) {
      if (!brandIds.has(brandId)) continue;
    }
    if (componentIds.has(component.id)) continue;
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    previewLines,
  };
}

export function previewAiPatch(
  proposal: AiPatchProposal,
  workspace: AiWorkspaceDraft
): AiReviewResult {
  return validateAiPatch(proposal, workspace);
}

export function applyAiPatchToWorkspaceDraft(
  proposal: AiPatchProposal,
  workspace: AiWorkspaceDraft
): AiApplyResult {
  const review = validateAiPatch(proposal, workspace);
  if (!review.ok) {
    return {
      ok: false,
      message: "Patch has blocking validation errors.",
      issues: review.issues,
    };
  }

  let draft: AiWorkspaceDraft = cloneWorkspaceDraft(workspace);
  const issues: ValidationIssue[] = [...review.issues];

  for (const [index, operation] of proposal.operations.entries()) {
    try {
      draft = applyOperation(operation, draft);
    } catch (err) {
      issues.push(
        patchIssue(
          proposal.id,
          index,
          "error",
          err instanceof Error ? err.message : "Patch operation failed",
          previewOperation(operation)
        )
      );
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  return {
    ok: !hasError,
    message: hasError ? "Patch failed." : "Patch applied to the workspace draft.",
    draft: hasError ? undefined : draft,
    issues,
  };
}

export function summarizeAiSession(input: {
  command: AiCommandInput;
  proposal: AiPatchProposal;
}): AiCommandSession {
  return {
    id: `ai-session-${input.proposal.id}`,
    kind: input.command.kind,
    promptSummary: summarizePrompt(input.command.prompt),
    providerKind: input.proposal.source.providerKind,
    modelId: input.proposal.source.modelId,
    patchIds: shouldQueueAiProposal(input.proposal) ? [input.proposal.id] : [],
    createdAt: input.proposal.createdAt,
  };
}

export function listSyncConnectors(): SyncConnector[] {
  return [
    {
      id: "figma",
      kind: "figma",
      name: "Figma",
      description: "File/plugin based DTCG payload exchange with review before replace.",
      readiness: "active",
      capabilities: ["export", "import", "diff", "review-before-apply", "variables"],
      route: "/sync/figma",
    },
    {
      id: "dtcg-file",
      kind: "dtcg-file",
      name: "DTCG file",
      description: "Portable token JSON import/export for any tool that speaks DTCG.",
      readiness: "active",
      capabilities: ["export", "import", "diff", "review-before-apply"],
      route: "/exports",
    },
    {
      id: "code",
      kind: "code",
      name: "Code",
      description: "Future code-aware connector for packages, components, and generated artifacts.",
      readiness: "planned",
      capabilities: ["export", "components", "code-bindings"],
    },
    {
      id: "generic-design-tool",
      kind: "generic-design-tool",
      name: "Generic design tool",
      description: "Future adapter contract for design tools beyond Figma.",
      readiness: "planned",
      capabilities: ["export", "import", "diff", "review-before-apply", "variables", "components"],
    },
  ];
}

function createDeterministicOperations(
  input: AiCommandInput,
  context: AiWorkspaceContext
): AiPatchOperation[] {
  if (input.kind === "release-notes" || input.outputMode === "release-notes") {
    return [
      {
        type: "release-note.generate",
        notes: context.releaseDraft?.notes || "No semantic diff is available for release notes.",
      },
    ];
  }

  if (input.outputMode === "explain-only") return [];

  if (input.kind === "suggest-names") {
    return [
      {
        type: "release-note.generate",
        notes: buildNamingNotes(input.prompt),
      },
    ];
  }

  if (input.kind !== "propose-fixes" && input.kind !== "design-system") {
    return [];
  }

  const operations: AiPatchOperation[] = [];
  operations.push(...buildTokenFixes(context.health.issues, input.workspace.sets));
  operations.push(...buildDesignSystemFixes(input.workspace));

  return operations.slice(0, 8);
}

function buildTokenFixes(issues: ValidationIssue[], sets: TokenSet[]): AiPatchOperation[] {
  const operations: AiPatchOperation[] = [];
  for (const issue of issues) {
    if (!issue.id.startsWith("missing-type:")) continue;
    const { setId, path } = issue.source;
    if (!setId || !path) continue;
    const set = sets.find((item) => item.id === setId);
    const node = set ? getNodeAtPath(set.root, path) : undefined;
    if (!isDtcgToken(node)) continue;
    operations.push({
      type: "token.patch",
      setId,
      path,
      patch: {
        $type: "color",
        $description: node.$description ?? "AI suggested a default type; review before saving.",
      },
    });
  }
  return operations;
}

function buildDesignSystemFixes(workspace: AiCommandInput["workspace"]): AiPatchOperation[] {
  const operations: AiPatchOperation[] = [];
  for (const brand of workspace.brands) {
    const resolved = resolveBrandPackage(brand.id, {
      sets: workspace.sets,
      themes: workspace.themes,
      brands: workspace.brands,
      components: workspace.components,
      exportProfiles: workspace.exportProfiles,
    });
    if (!resolved) continue;
    const next: Brand = {
      ...brand,
      baseBrandId: resolved.missing.baseBrandIds.includes(brand.baseBrandId ?? "")
        ? undefined
        : brand.baseBrandId,
      tokenSetIds: brand.tokenSetIds.filter((id) => !resolved.missing.tokenSetIds.includes(id)),
      themeIds: brand.themeIds.filter((id) => !resolved.missing.themeIds.includes(id)),
      exportProfileIds: brand.exportProfileIds.filter((id) => !resolved.missing.exportProfileIds.includes(id)),
      componentIds: brand.componentIds.filter((id) => !resolved.missing.componentIds.includes(id)),
      updatedAt: new Date().toISOString(),
    };
    if (JSON.stringify(next) !== JSON.stringify(brand)) {
      operations.push({ type: "brand.upsert", brand: next });
    }
  }

  const brandIds = new Set(workspace.brands.map((brand) => brand.id));
  const tokenRefs = new Set(
    workspace.sets.flatMap((set) =>
      Object.keys(flattenGroupPaths(set.root)).map((path) => `${set.id}:${path}`)
    )
  );
  for (const component of workspace.components) {
    const next: DesignSystemComponent = {
      ...component,
      brandIds: component.brandIds.filter((id) => brandIds.has(id)),
      tokenRefs: component.tokenRefs.filter((ref) => tokenRefs.has(ref)),
      bindings: {
        code: component.bindings.code.filter((binding) => binding.source.trim()),
        figma: component.bindings.figma.filter(
          (binding) => binding.fileKey || binding.nodeId || binding.componentName
        ),
      },
      updatedAt: new Date().toISOString(),
    };
    if (JSON.stringify(next) !== JSON.stringify(component)) {
      operations.push({ type: "component.upsert", component: next });
    }
  }
  return operations;
}

function applyOperation(operation: AiPatchOperation, workspace: AiWorkspaceDraft): AiWorkspaceDraft {
  switch (operation.type) {
    case "token.patch":
      return {
        ...workspace,
        sets: workspace.sets.map((set) =>
          set.id === operation.setId
            ? {
                ...set,
                root: setTokenAtPath(
                  set.root,
                  operation.path,
                  // Schema validates structural shape; DtcgValue is intentionally
                  // permissive (includes Record<string, unknown>) so the runtime
                  // contract matches.
                  operation.patch as Partial<DtcgToken>
                ),
              }
            : set
        ),
      };
    case "theme.upsert":
      return {
        ...workspace,
        themes: upsertById(workspace.themes, operation.theme, normalizeThemes),
      };
    case "brand.upsert":
      return {
        ...workspace,
        brands: upsertById(workspace.brands, operation.brand, normalizeBrands),
      };
    case "component.upsert":
      return {
        ...workspace,
        components: upsertById(workspace.components, operation.component, normalizeComponents),
      };
    case "export-profile.upsert":
      return {
        ...workspace,
        exportProfiles: upsertById(
          workspace.exportProfiles,
          operation.profile,
          normalizeExportProfiles
        ),
      };
    case "release-note.generate":
      return { ...workspace, releaseNotes: operation.notes };
    case "figma.apply-to-rozetta":
    case "figma.push-to-figma":
    case "github.pr.create":
      return workspace;
  }
}

function upsertById<T extends { id: string }>(
  list: T[],
  item: T,
  normalize: (value: unknown) => T[]
): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  byId.set(item.id, item);
  return normalize(Array.from(byId.values()));
}

function cloneWorkspaceDraft(workspace: AiWorkspaceDraft): AiWorkspaceDraft {
  return JSON.parse(JSON.stringify(workspace)) as AiWorkspaceDraft;
}

function previewOperation(operation: AiPatchOperation): string {
  switch (operation.type) {
    case "token.patch":
      return `Patch token ${operation.setId}:${operation.path}`;
    case "theme.upsert":
      return `Upsert theme ${operation.theme.name}`;
    case "brand.upsert":
      return `Upsert brand ${operation.brand.name}`;
    case "component.upsert":
      return `Upsert component ${operation.component.name}`;
    case "release-note.generate":
      return "Generate reviewable release notes";
    case "export-profile.upsert":
      return `Upsert export profile ${operation.profile.name}`;
    case "figma.apply-to-rozetta":
      return `Review Figma → Rozetta sync run ${operation.syncRunId}`;
    case "figma.push-to-figma":
      return `Prepare Rozetta → Figma payload for sync run ${operation.syncRunId}`;
    case "github.pr.create":
      return `Create GitHub PR from draft ${operation.draftId}`;
  }
}

function patchIssue(
  proposalId: string,
  index: number,
  severity: ValidationIssue["severity"],
  title: string,
  detail: string
): ValidationIssue {
  return {
    id: `ai-patch:${proposalId}:${index}:${slugify(title)}`,
    severity,
    source: { kind: "workspace" },
    title,
    detail,
    action: "Review or remove this operation before applying the patch.",
  };
}

function titleForTask(kind: AiCommandInput["kind"]): string {
  const titles: Record<AiCommandInput["kind"], string> = {
    "explain-issues": "Explain workspace issues",
    "suggest-names": "Suggest design system names",
    "propose-fixes": "Propose safe fixes",
    "design-system": "Improve design system registry",
    "release-notes": "Generate release notes",
    "workspace-question": "Answer workspace question",
  };
  return titles[kind];
}

function summaryForTask(
  input: AiCommandInput,
  context: AiWorkspaceContext,
  operations: AiPatchOperation[]
): string {
  if (input.kind === "release-notes") {
    return context.releaseDraft?.summary || "Prepared release notes from the current workspace context.";
  }
  if (operations.length === 0) {
    return "No concrete patch operations were generated. Use the notes as guidance.";
  }
  return `${operations.length} reviewable operation${operations.length === 1 ? "" : "s"} generated from ${context.health.issues.length} workspace issue${context.health.issues.length === 1 ? "" : "s"}.`;
}

function buildNamingNotes(prompt: string): string {
  const seed = slugify(prompt || "semantic token").replace(/-/g, ".");
  return [
    "Suggested naming directions:",
    `- ${seed}.default`,
    `- ${seed}.emphasis`,
    `- ${seed}.inverse`,
    "",
    "Review the final category and intent before applying to token paths.",
  ].join("\n");
}

function summarizePrompt(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (!trimmed) return "No prompt provided.";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function isAiConversationMessage(value: unknown): value is AiConversationMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiConversationMessage>;
  return (
    typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant" || item.role === "system") &&
    typeof item.content === "string" &&
    typeof item.createdAt === "string" &&
    (item.status === "ready" || item.status === "pending" || item.status === "error")
  );
}

function conversationMessageId(role: AiConversationMessage["role"], now: string, seed: string): string {
  return `ai-message-${now.replace(/[^0-9]/g, "")}-${role}-${slugify(seed).slice(0, 48)}`;
}

function assistantMessageContent(proposal: AiPatchProposal, patchQueued: boolean): string {
  if (patchQueued) {
    return `${proposal.summary}\n\nI queued the suggested change${proposal.operations.length === 1 ? "" : "s"} for review.`;
  }
  return proposal.summary || "I checked the selected context and did not queue any changes.";
}

function flattenGroupPaths(root: DtcgGroup, parentPath = ""): Record<string, true> {
  const paths: Record<string, true> = {};
  for (const [key, child] of Object.entries(root)) {
    if (key.startsWith("$")) continue;
    const childPath = parentPath ? `${parentPath}.${key}` : key;
    if (isDtcgToken(child)) {
      paths[childPath] = true;
    } else if (child && typeof child === "object") {
      Object.assign(paths, flattenGroupPaths(child as DtcgGroup, childPath));
    }
  }
  return paths;
}

function mentionMatchesQuery(mention: AiMentionContext, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = [
    mention.kind,
    mention.label,
    mention.description,
    mention.path ?? "",
    mention.payloadPreview,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}
