import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";

export type {
  AiPatchOperation,
} from "@/lib/ai-os/contract/operation-schema";
export type {
  AiPatchProposal,
  AiPatchProposalSource,
  AiPatchStatus,
} from "@/lib/ai-os/contract/proposal-schema";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueSourceKind =
  | "workspace"
  | "collection"
  | "set"
  | "token"
  | "theme"
  | "brand"
  | "component"
  | "design-system"
  | "git";

export interface IssueSource {
  kind: IssueSourceKind;
  collectionId?: string;
  modeId?: string;
  setId?: string;
  themeId?: string;
  brandId?: string;
  componentId?: string;
  path?: string;
  file?: string;
}

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  source: IssueSource;
  title: string;
  detail: string;
  action: string;
}

export interface WorkspaceHealthSummary {
  sets: number;
  tokens: number;
  themes: number;
  brands: number;
  components: number;
  dirtySets: number;
  localOnlySets: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface WorkspaceHealth {
  generatedAt: string;
  summary: WorkspaceHealthSummary;
  issues: ValidationIssue[];
  git?: GitStatusSummary;
}

export type GitFileKind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "unknown";

export interface GitFileStatus {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  kind: GitFileKind;
}

export interface GitStatusSummary {
  available: boolean;
  branch: string;
  ahead: number;
  behind: number;
  clean: boolean;
  files: GitFileStatus[];
  tokenFiles: GitFileStatus[];
  designSystemFiles: GitFileStatus[];
  error?: string;
}

export type TokenChangeKind =
  | "set-created"
  | "set-removed"
  | "token-created"
  | "token-removed"
  | "value-changed"
  | "type-changed"
  | "description-changed"
  | "alias-changed";

export interface TokenChange {
  id: string;
  kind: TokenChangeKind;
  setId: string;
  setName: string;
  path?: string;
  before?: string;
  after?: string;
}

export interface TokenSemanticDiff {
  generatedAt: string;
  baselineSets: number;
  currentSets: number;
  changes: TokenChange[];
  summary: Record<TokenChangeKind, number> & { total: number };
}

export type ReleaseVersionKind = "patch" | "minor" | "major" | "canary";

export interface ReleaseArtifactPreview {
  id: string;
  name: string;
  format: "tokens-json" | "css" | "tailwind" | "flat-json" | "style-dictionary";
  target: string;
  description: string;
}

export interface ReleaseDraft {
  id: string;
  versionKind: ReleaseVersionKind;
  title: string;
  summary: string;
  notes: string;
  changes: TokenChange[];
  designSystemChanges: DesignSystemChange[];
  artifacts: ReleaseArtifactPreview[];
  generatedAt: string;
}

export type ExportProfileTargetKind = "collection" | "set" | "theme";
export type ExportProfileFormat = "css" | "tailwind" | "json" | "style-dictionary";
export type ExportProfileStatus = "valid" | "missing-target" | "planned-format";

export interface ExportProfile {
  id: string;
  name: string;
  targetKind: ExportProfileTargetKind;
  targetId: string;
  format: ExportProfileFormat;
  destination: string;
  updatedAt: string;
}

export interface ExportProfilePreview {
  profileId: string;
  status: ExportProfileStatus;
  targetName: string;
  filename: string;
  language: "css" | "javascript" | "json" | "text";
  output: string;
  message: string;
  /** Conflict count from `resolveTheme` for theme targets. Zero for collections. */
  conflicts: number;
}

export interface FigmaCollectionMapping {
  collectionId: string;
  collectionName: string;
  figmaCollectionId?: string;
  /** Legacy alias while older payload consumers migrate to `collectionId`. */
  setId?: string;
}

export interface FigmaModeMapping {
  collectionId: string;
  modeId: string;
  modeName: string;
  figmaModeId?: string;
  themeId?: string;
  collectionIds: string[];
  /** Legacy alias while older payload consumers migrate to `collectionIds`. */
  setIds?: string[];
}

export interface FigmaSyncPayload {
  version: "rozetta-figma-sync/v1";
  generatedAt: string;
  sets: TokenSet[];
  themes: Array<{
    id: string;
    name: string;
    description?: string;
    sets: Array<{
      collectionId?: string;
      setId: string;
      modeId?: string;
      state?: "enabled" | "source" | "disabled";
      mode: "enabled" | "source" | "disabled";
    }>;
    updatedAt: string;
  }>;
  collections: FigmaCollectionMapping[];
  modes: FigmaModeMapping[];
}

export interface SyncDiff {
  generatedAt: string;
  incomingSets: number;
  incomingThemes: number;
  tokenDiff: TokenSemanticDiff;
}

export type FigmaVariableResolvedType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
export type FigmaVariableSource = "plugin" | "fixture" | "manual";

export type FigmaVariableValue =
  | string
  | number
  | boolean
  | { r: number; g: number; b: number; a?: number }
  | { type: "VARIABLE_ALIAS"; id: string }
  | Record<string, unknown>;

export interface FigmaModeSnapshot {
  modeId: string;
  name: string;
}

export interface FigmaCollectionSnapshot {
  collectionId: string;
  name: string;
  modes: FigmaModeSnapshot[];
  variableIds: string[];
}

export interface FigmaVariableSnapshot {
  id: string;
  key?: string;
  name: string;
  collectionId: string;
  collectionName: string;
  resolvedType: FigmaVariableResolvedType;
  valuesByMode: Record<string, FigmaVariableValue>;
  description?: string;
  scopes?: string[];
  codeSyntax?: Record<string, string>;
}

export interface FigmaFileSnapshot {
  fileKey: string;
  name: string;
  url?: string;
  source: FigmaVariableSource;
  createdAt: string;
  collections: FigmaCollectionSnapshot[];
  variables: FigmaVariableSnapshot[];
}

export interface FigmaVariableBinding {
  id: string;
  figmaFileId: string;
  variableId: string;
  collectionId: string;
  modeId?: string;
  rozettaCollectionId?: string;
  rozettaModeId?: string;
  setId: string;
  tokenPath: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export type SyncDirection = "figma-to-rozetta" | "rozetta-to-figma" | "github-pr";
export type SyncRunStatus = "draft" | "reviewed" | "applied" | "failed";
export type SyncOperationKind =
  | "token.create"
  | "token.update"
  | "token.remove"
  | "theme.upsert"
  | "figma.variable.upsert"
  | "github.pr.create";
export type SyncOperationStatus = "pending" | "reviewed" | "applied" | "blocked";

export interface SyncOperation {
  id: string;
  runId: string;
  kind: SyncOperationKind;
  status: SyncOperationStatus;
  targetKind: "token" | "theme" | "figma-variable" | "github-pr";
  targetId: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncRun {
  id: string;
  connectorId: string;
  direction: SyncDirection;
  status: SyncRunStatus;
  sourceSnapshotId?: string;
  summary: string;
  operations: SyncOperation[];
  createdAt: string;
  completedAt?: string;
}

export interface FigmaBridgeState {
  fileId?: string;
  latestSnapshot?: FigmaFileSnapshot;
  bindings: FigmaVariableBinding[];
  lastSyncRun?: SyncRun;
  recentSyncRuns: SyncRun[];
}

export type GitHubPrDraftStatus = "draft" | "published" | "failed";

export interface GitHubPrDraft {
  id: string;
  branchName: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  status: GitHubPrDraftStatus;
  url?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPublishResult {
  ok: boolean;
  draft?: GitHubPrDraft;
  url?: string;
  error?: string;
}

export interface OperationalContext {
  figma?: FigmaBridgeState;
  githubPrDrafts: GitHubPrDraft[];
  syncRuns: SyncRun[];
}

export type BrandStatus = "draft" | "active" | "deprecated";
export type ComponentStatus = "draft" | "ready" | "deprecated";

export interface BrandFigmaMapping {
  collectionId: string;
  collectionName?: string;
  modeId?: string;
  modeName?: string;
  themeId?: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: BrandStatus;
  baseBrandId?: string;
  tokenSetIds: string[];
  themeIds: string[];
  exportProfileIds: string[];
  componentIds: string[];
  figmaFile?: {
    fileKey: string;
    url?: string;
    mappings: BrandFigmaMapping[];
  };
  updatedAt: string;
}

export interface ComponentVariant {
  id: string;
  name: string;
  values: string[];
}

export interface ComponentProp {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ComponentState {
  name: string;
  description?: string;
}

export interface ComponentCodeBinding {
  source: string;
  exportName?: string;
  framework?: string;
}

export interface ComponentFigmaBinding {
  fileKey?: string;
  nodeId?: string;
  componentName?: string;
}

export interface DesignSystemComponent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  status: ComponentStatus;
  tokenRefs: string[];
  variants: ComponentVariant[];
  props: ComponentProp[];
  states: ComponentState[];
  bindings: {
    code: ComponentCodeBinding[];
    figma: ComponentFigmaBinding[];
  };
  brandIds: string[];
  updatedAt: string;
}

export interface DesignSystemRegistry {
  themes: Theme[];
  brands: Brand[];
  components: DesignSystemComponent[];
}

export type DesignSystemRegistryInput = DesignSystemRegistry;

export interface ResolvedBrandPackage {
  brand: Brand;
  inheritedBrandIds: string[];
  tokenSetIds: string[];
  themeIds: string[];
  exportProfileIds: string[];
  componentIds: string[];
  missing: {
    baseBrandIds: string[];
    tokenSetIds: string[];
    themeIds: string[];
    exportProfileIds: string[];
    componentIds: string[];
  };
  cycleDetected: boolean;
}

export type DesignSystemChangeKind =
  | "theme-created"
  | "theme-removed"
  | "theme-updated"
  | "brand-created"
  | "brand-removed"
  | "brand-updated"
  | "component-created"
  | "component-removed"
  | "component-updated";

export interface DesignSystemChange {
  id: string;
  kind: DesignSystemChangeKind;
  area: "themes" | "brands" | "components";
  name: string;
  before?: string;
  after?: string;
}

export interface DesignSystemDiff {
  generatedAt: string;
  changes: DesignSystemChange[];
  summary: Record<DesignSystemChangeKind, number> & { total: number };
}

export interface DesignSystemPatchProposal {
  appliesAutomatically: false;
  proposals: Array<{
    id: string;
    title: string;
    detail: string;
    source: IssueSource;
  }>;
}

export interface WorkspaceSnapshot {
  sets: TokenSet[];
  baselineSets: TokenSet[];
  git: GitStatusSummary;
}

export type AiProviderKind =
  | "deterministic"
  | "openai"
  | "anthropic"
  | "claude-code-local"
  | "codex-local";

export interface AiModelConfig {
  id: string;
  label: string;
}

export interface AiProviderConfig {
  id: string;
  kind: AiProviderKind;
  label: string;
  enabled: boolean;
  model: AiModelConfig;
  hasApiKey: boolean;
  apiKey?: string;
  baseUrl?: string;
  executablePath?: string;
  updatedAt: string;
}

export interface AiSettings {
  version: "rozetta-ai-settings/v1";
  activeProviderId: string;
  providers: AiProviderConfig[];
  updatedAt: string;
}

export type AiTaskKind =
  | "explain-issues"
  | "suggest-names"
  | "propose-fixes"
  | "design-system"
  | "release-notes"
  | "workspace-question";

export interface AiTaskContext {
  sets: boolean;
  themes: boolean;
  brands: boolean;
  components: boolean;
  releases: boolean;
  git: boolean;
}

export type AiGitScope = "current-branch" | "changed-files" | "semantic-diff" | "none";
export type AiOutputMode = "review-suggestion" | "explain-only" | "release-notes";
export type AiTargetScope = "workspace" | "tokens" | "brands" | "components" | "release";

export interface AiAttachmentContext {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textPreview: string;
}

export type AiVoiceInputState = "idle" | "listening" | "transcribing" | "error";

export type AiMentionKind = "token" | "theme" | "brand" | "component" | "release" | "git-file";

export interface AiMentionContext {
  id: string;
  kind: AiMentionKind;
  label: string;
  description: string;
  path?: string;
  payloadPreview: string;
}

export interface AiSlashCommand {
  id:
    | "audit-workspace"
    | "propose-fixes"
    | "release-notes"
    | "improve-naming"
    | "ask-workspace"
    | "design-system-proposal"
    | "validate-workspace"
    | "semantic-diff"
    | "export-preview";
  label: string;
  description: string;
  taskKind: AiTaskKind;
  defaultPrompt: string;
}

export type AiReadOnlyToolState = "input-available" | "output-available" | "output-error";

export interface AiReadOnlyToolCall {
  id: string;
  name: "validate_workspace" | "semantic_diff" | "resolve_context" | "preview_export";
  title: string;
  state: AiReadOnlyToolState;
  input: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}

export type AiReasoningStepStatus = "pending" | "active" | "complete";

export interface AiReasoningStep {
  title: string;
  description: string;
  status: AiReasoningStepStatus;
}

export interface AiWorkspaceContext {
  generatedAt: string;
  health: WorkspaceHealth;
  semanticDiff?: TokenSemanticDiff;
  designSystemDiff?: DesignSystemDiff;
  releaseDraft?: ReleaseDraft;
  operational?: OperationalContext;
  focus: AiTaskContext;
}

export interface AiCommandInput {
  kind: AiTaskKind;
  prompt: string;
  context: AiTaskContext;
  gitScope?: AiGitScope;
  outputMode?: AiOutputMode;
  targetScope?: AiTargetScope;
  attachments?: AiAttachmentContext[];
  mentions?: AiMentionContext[];
  slashCommandId?: AiSlashCommand["id"];
  toolPreference?: "read-only";
  workspace: {
    sets: TokenSet[];
    baselineSets?: TokenSet[];
    themes: Theme[];
    brands: Brand[];
    components: DesignSystemComponent[];
    exportProfiles: ExportProfile[];
    git?: GitStatusSummary;
    operational?: OperationalContext;
  };
  providerId?: string;
}

export interface AiReviewResult {
  ok: boolean;
  issues: ValidationIssue[];
  previewLines: string[];
}

export interface AiWorkspaceDraft {
  sets: TokenSet[];
  themes: Theme[];
  brands: Brand[];
  components: DesignSystemComponent[];
  exportProfiles: ExportProfile[];
  releaseNotes?: string;
}

export interface AiApplyResult {
  ok: boolean;
  message: string;
  draft?: AiWorkspaceDraft;
  issues: ValidationIssue[];
}

export interface AiCommandSession {
  id: string;
  kind: AiTaskKind;
  promptSummary: string;
  providerKind: AiProviderKind;
  modelId: string;
  patchIds: string[];
  createdAt: string;
}

export type AiMessageRole = "user" | "assistant" | "system";
export type AiMessageStatus = "ready" | "pending" | "error";

export interface AiConversationMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  createdAt: string;
  status: AiMessageStatus;
  taskKind?: AiTaskKind;
  context?: AiTaskContext;
  mentions?: AiMentionContext[];
  attachments?: AiAttachmentContext[];
  toolCalls?: AiReadOnlyToolCall[];
  reasoningSteps?: AiReasoningStep[];
  patchId?: string;
  providerKind?: AiProviderKind;
  modelId?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  messages: AiConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export type SyncConnectorKind = "figma" | "dtcg-file" | "code" | "generic-design-tool";
export type SyncReadiness = "active" | "planned" | "needs-setup";
export type SyncCapability =
  | "export"
  | "import"
  | "diff"
  | "review-before-apply"
  | "variables"
  | "components"
  | "code-bindings";

export interface SyncConnector {
  id: string;
  kind: SyncConnectorKind;
  name: string;
  description: string;
  readiness: SyncReadiness;
  capabilities: SyncCapability[];
  route?: string;
}
