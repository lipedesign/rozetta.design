# Contracts

The public API surface. Every entry here is a stable boundary — agents and code should treat these signatures as load-bearing.

For type definitions see [`domain.md`](./domain.md). For layering rules see [`architecture.md §7`](./architecture.md#7-module-boundaries).

---

## 1. Server Actions

### 1.0 Auth and workspace context

Files: *src/lib/auth/actions.ts*, *src/lib/auth/workspace-context.ts*, *src/lib/auth/supabase/***.

```ts
type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
type AuthSource = "supabase" | "dev" | "test";

interface WorkspaceContext {
  userId: string;
  organizationId: string;
  workspaceId: string;
  role: WorkspaceRole;
  source: AuthSource;
}

function createBrowserSupabaseClient(): SupabaseClient;
function createServerSupabaseClient(): Promise<SupabaseClient>;
function updateSupabaseSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }>;

function signInWithPassword(state: AuthFormState, formData: FormData): Promise<AuthFormState>;
function signUpWithPassword(state: AuthFormState, formData: FormData): Promise<AuthFormState>;
function signInWithOAuthProvider(formData: FormData): Promise<void>;
function signOut(): Promise<void>;
function requestPasswordReset(state: AuthFormState, formData: FormData): Promise<AuthFormState>;
function updatePassword(state: AuthFormState, formData: FormData): Promise<AuthFormState>;

function getCurrentUser(): Promise<AuthUserProfile | undefined>;
function getWorkspaceContext(): Promise<WorkspaceContext>;
function requireWorkspaceContext(): Promise<WorkspaceContext>;
function listWorkspaceSwitcherOptions(): Promise<WorkspaceSwitcherOption[]>;
function switchWorkspace(formData: FormData): Promise<void>;
function canReadWorkspace(context: WorkspaceContext): boolean;
function canWriteWorkspace(context: WorkspaceContext): boolean;
function canManageWorkspace(context: WorkspaceContext): boolean;
function requireWorkspaceRole(context: WorkspaceContext, minimumRole: WorkspaceRole): void;
```

- Auth uses Supabase SSR cookies through `@supabase/ssr`.
- Client code receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server code MUST NOT expose DB passwords, service role keys, provider API keys, or `.rozetta/*.local.json` values.
- `getWorkspaceContext` MUST validate the current session in Supabase mode, bootstrap profile/organization/workspace on first login, and resolve the active workspace from a secure cookie.
- Product repositories and Server Actions that touch workspace data MUST receive or resolve `WorkspaceContext`.
- Mutations MUST call `requireWorkspaceRole(context, "editor")` or a stricter role before writing.
- Local dev fallback MAY return the default workspace only outside production.
- Production MUST fail closed when Supabase Auth env is missing.

File: *src/lib/tokens/actions.ts* (`'use server'`).

Token APIs keep some legacy names (`TokenSet`, `setId`, `sets`) for compatibility. Their public meaning is now:

- `TokenSet` is a type alias for `TokenCollection`.
- `setId` means `collectionId` unless a contract explicitly says legacy artifact id.
- Mode-aware contracts include `modeId`; when omitted, the active/default Collection Mode is used.

### 1.1 `getInitialState`

```ts
function getInitialState(): Promise<{
  sets: TokenCollection[]; // legacy prop name consumed by TokensProvider
  originalRoots: Record<string, DtcgGroup>;
}>;
```

- Loads the live token Collections and Modes from Supabase/Postgres.
- If the DB has no Collections yet, imports `tokens/<collection>/<mode>.tokens.json` plus legacy `tokens/*.tokens.json` / `tokens/*.edited.tokens.json`.
- `originalRoots` is built from current Git-native token artifacts and is used as the dirty baseline. Mode roots are keyed as `${collectionId}:${modeId}`; active/default roots also keep the legacy `${collectionId}` key.
- Returns an empty `sets` array if neither DB nor token artifacts contain Collections.

### 1.2 `saveTokenSet`

```ts
type SaveResult = { ok: true; filename: string } | { ok: false; error: string };
function saveTokenSet(setId: string, root: DtcgGroup): Promise<SaveResult>;
```

- Backward-compatible low-level legacy action.
- Writes `tokens/<setId>.edited.tokens.json` with 2-space JSON + trailing newline.
- MUST NOT touch any other file.
- On success: revalidates `/`. Returns `{ ok: true, filename }`.
- On failure: returns `{ ok: false, error }`. MUST NOT throw.
- Backward-compatible low-level action. The primary workspace save flow uses `saveWorkspaceArtifacts`.

### 1.3 DB-first token/workspace actions

```ts
function saveTokenSetDraft(set: TokenCollection): Promise<SaveResult>;
function deleteTokenSetDraft(setId: string): Promise<SaveResult>;
function saveWorkspaceArtifacts(): Promise<
  | { ok: true; tokenFiles: string[]; themesFile?: string; exportedAt: string }
  | { ok: false; error: string }
>;
function importFilesystemWorkspaceToDb(): Promise<SaveResult>;
function getDbWorkspaceHealth(): Promise<WorkspaceHealth>;
```

- `saveTokenSetDraft` and `deleteTokenSetDraft` mutate live DB Collections, not Git artifacts.
- `saveWorkspaceArtifacts` serializes the DB workspace to `tokens/<collection>/<mode>.tokens.json` and `.rozetta/themes.json`.
- `importFilesystemWorkspaceToDb` is idempotent and only imports filesystem artifacts when the DB is empty.
- `getDbWorkspaceHealth` validates the DB workspace.

### 1.4 `discardEdits`

```ts
function discardEdits(setId: string): Promise<SaveResult>;
```

- Deletes `tokens/<setId>.edited.tokens.json` if present.
- A missing file is a no-op (still `{ ok: true }`).
- Revalidates `/` on success.
- Kept for compatibility with artifact management; the DB-first discard flow reverts drafts in DB and does not delete saved artifacts.

### 1.5 Export profile actions

File: *src/lib/export-profiles/actions.ts* (`'use server'`).

```ts
function getExportProfiles(): Promise<{
  exists: boolean;
  profiles: ExportProfile[];
  path: string;
}>;

function saveExportProfiles(
  profiles: ExportProfile[]
): Promise<{ ok: true; path: string; profiles: ExportProfile[] } | { ok: false; error: string }>;
```

- Reads/writes `.rozetta/export-profiles.json`.
- Creates `.rozetta/` on save when needed.
- Returns errors instead of throwing across the Server Action boundary.

### 1.6 Theme actions

File: *src/lib/themes/actions.ts* (`'use server'`).

```ts
function getThemes(): Promise<{
  exists: boolean;
  path: string;
  themes: Theme[];
  originalThemes: Theme[];
}>;
function saveThemes(themes: Theme[]): Promise<
  { ok: true; path: string; themes: Theme[] } | { ok: false; error: string }
>;
function saveThemeDraft(theme: Theme): Promise<
  { ok: true; path: string; themes: Theme[] } | { ok: false; error: string }
>;
```

- Reads/writes the live theme draft state in Supabase/Postgres.
- `originalThemes` is built from `.rozetta/themes.json` and is used as the dirty baseline.
- `.rozetta/themes.json` is generated by `saveWorkspaceArtifacts`, not by every theme edit.
- Legacy `rozetta-themes-v1` migration is handled client-side by `themes-store` and persisted into DB.

### 1.7 Design system actions

File: *src/lib/design-system/actions.ts* (`'use server'`).

```ts
function getBrands(): Promise<{ exists: boolean; brands: Brand[]; path: string }>;
function saveBrands(brands: Brand[]): Promise<
  { ok: true; path: string; brands: Brand[] } | { ok: false; error: string }
>;

function getComponents(): Promise<{ exists: boolean; components: DesignSystemComponent[]; path: string }>;
function saveComponents(components: DesignSystemComponent[]): Promise<
  { ok: true; path: string; components: DesignSystemComponent[] } | { ok: false; error: string }
>;
```

- Reads/writes `.rozetta/brands.json` and `.rozetta/components.json`.
- Returns errors instead of throwing across the Server Action boundary.
- Brand actions are retained for compatibility while the Brands UI is paused; active product authoring uses component actions.

### 1.8 AI OS actions

File: *src/lib/ai-os/actions.ts* (`'use server'`).

```ts
function getAiSettings(): Promise<{ exists: boolean; path: string; settings: AiSettings }>;
function saveAiSettings(settings: AiSettings): Promise<
  { ok: true; path: string; settings: AiSettings } | { ok: false; error: string }
>;

function getAiPatchQueue(): Promise<{ exists: boolean; path: string; patches: AiPatchProposal[] }>;
function saveAiPatchQueue(patches: AiPatchProposal[]): Promise<{ path: string; patches: AiPatchProposal[] }>;

function getAiSessions(): Promise<{ exists: boolean; path: string; sessions: AiCommandSession[] }>;
function saveAiSessions(sessions: AiCommandSession[]): Promise<{ path: string; sessions: AiCommandSession[] }>;

function getAiConversation(): Promise<{ exists: boolean; path: string; conversation: AiConversation }>;
function saveAiConversation(conversation: AiConversation): Promise<{ path: string; conversation: AiConversation }>;
function clearAiConversation(): Promise<{ exists: boolean; path: string; conversation: AiConversation }>;

function runAiCommand(command: AiCommandInput): Promise<RunAiCommandResult>;
function previewAiPatch(input: { proposal: AiPatchProposal; workspace: AiWorkspaceDraft }): Promise<AiReviewResult>;
function applyAiPatch(input: {
  proposal: AiPatchProposal;
  workspace: AiWorkspaceDraft;
}): Promise<AiApplyResult & { patchQueue?: AiPatchProposal[] }>;
```

- Reads/writes `.rozetta/ai-conversations.json`, `.rozetta/ai-patches.json`, and `.rozetta/ai-sessions.json`.
- Reads/writes `.rozetta/ai-settings.local.json` for local provider secrets exposed through `/settings`.
- `getAiSettings` MUST redact `apiKey` values and expose only `hasApiKey`.
- `runAiCommand` MAY call a configured provider through Vercel AI SDK; without a usable key it MUST use deterministic fallback.
- `runAiCommand` MUST append user and assistant messages to the active conversation.
- `runAiCommand` MUST only add a proposal to `.rozetta/ai-patches.json` when it contains reviewable operations.
- `applyAiPatch` marks proposal status but workspace application remains explicit and reviewable.

### 1.9 Settings actions

File: *src/lib/settings/actions.ts* (`'use server'`).

```ts
function getSettingsOverview(): Promise<SettingsOverview>;
function updateWorkspaceMeta(input: { name: string }): Promise<
  { ok: true; workspace: SettingsWorkspaceSummary } | { ok: false; error: string }
>;
function regenerateBridgePairingCode(): Promise<
  { ok: true; code: string; expiresAt: string } | { ok: false; error: string }
>;
```

- `getSettingsOverview` MUST return workspace identity, redacted AI settings, Figma bridge state, storage status, runtime info, and About links in one call so `/settings` renders without follow-up round trips.
- `updateWorkspaceMeta` MUST validate `name` against `/^.{1,80}$/` (after trimming), require at least the `admin` role on the active `WorkspaceContext`, persist `workspaces.name`, and `revalidatePath("/", "layout")` so the persistent shell picks up the new label.
- `regenerateBridgePairingCode` MUST require `admin` role and MUST return an ephemeral pairing code without persisting it server-side — the plugin pastes it once and the workspace stays the durable source of truth.
- Storage/runtime helpers (`readStorageStatus`, `readRuntimeInfo`, `redactDatabaseUrl`, `isWorkspaceDbConfigured`) live in *src/lib/settings/server.ts* (sync, server-only) because Next.js requires every export of a `'use server'` module to be an async Server Action.

---

## 2. Filesystem helpers (server/MCP-only)

File: *src/lib/tokens/filesystem.ts*. MUST NOT be imported by client code.

```ts
function listTokenFiles(): Promise<DiscoveredFile[]>;
function loadTokenSet(file: DiscoveredFile): Promise<TokenCollection | undefined>;
function loadAllTokenSets(): Promise<TokenCollection[]>;
function writeEditedTokenSet(setId: string, root: DtcgGroup): Promise<string>;
function writeTokenCollectionModeArtifact(
  collectionId: string,
  modeId: string,
  root: DtcgGroup
): Promise<string>;
function discardEditedTokenSet(setId: string): Promise<void>;
```

`DiscoveredFile` is internal — callers should treat it as opaque.
`loadAllTokenSets` reads canonical `tokens/<collection>/<mode>.tokens.json` artifacts and legacy top-level token files.

Export profile, theme, brand, and component filesystem helpers live under their feature folders and are server/MCP-only.

---

## 3. Git helpers (server/MCP-only)

File: *src/lib/git/status.ts*. MUST NOT be imported by client code.

```ts
function getGitStatusSummary(): Promise<GitStatusSummary>;
function loadGitBaselineTokenSets(ref?: string): Promise<TokenCollection[]>;
function loadGitBaselineDesignSystemRegistry(ref?: string): Promise<DesignSystemRegistryInput>;
```

`getGitStatusSummary` reads the current branch, ahead/behind counts, porcelain status, token-file subset, and `.rozetta/` design-system-file subset. It returns `available: false` instead of throwing when Git is unavailable.

`loadGitBaselineTokenSets` reads tracked canonical `tokens/<collection>/<mode>.tokens.json` artifacts and legacy `tokens/*.tokens.json` files from `HEAD` by default and parses them into `TokenCollection[]`. Invalid or unreadable files are skipped.

---

## 4. Workspace product modules

Files: *src/lib/workspace/validation.ts*, *src/lib/workspace/diff.ts*, *src/lib/workspace/releases.ts*, *src/lib/workspace/types.ts*.

```ts
type IssueSeverity = "error" | "warning" | "info";
type TokenChangeKind =
  | "set-created"
  | "set-removed"
  | "token-created"
  | "token-removed"
  | "value-changed"
  | "type-changed"
  | "description-changed"
  | "alias-changed";
type ReleaseVersionKind = "patch" | "minor" | "major" | "canary";

function buildWorkspaceHealth(input: {
  sets: TokenCollection[];
  themes: Theme[];
  exportProfiles?: ExportProfile[];
  brands?: Brand[];
  components?: DesignSystemComponent[];
  dirtySetIds?: string[];
  localOnlySetIds?: string[];
  git?: GitStatusSummary;
}): WorkspaceHealth;

function diffTokenSets(
  baselineSets: TokenCollection[],
  currentSets: TokenCollection[]
): TokenSemanticDiff;

function generateReleaseDraft(
  diff: TokenSemanticDiff,
  versionKind: ReleaseVersionKind,
  designSystemDiff?: DesignSystemDiff
): ReleaseDraft;
```

These modules MUST remain pure, deterministic from their inputs except for `generatedAt`, and safe to reuse from future MCP/AI tooling.

Design system helpers:

```ts
function normalizeBrands(value: unknown): Brand[];
function normalizeComponents(value: unknown): DesignSystemComponent[];
function resolveBrandPackage(brandId: string, input: DesignSystemInput): ResolvedBrandPackage | undefined;
function validateDesignSystem(input: DesignSystemInput): ValidationIssue[];
function diffDesignSystemRegistry(
  baseline: DesignSystemRegistryInput,
  current: DesignSystemRegistryInput
): DesignSystemDiff;
function proposeDesignSystemPatch(issues: ValidationIssue[]): DesignSystemPatchProposal;
```

These helpers MUST remain pure and MUST NOT import React, Next routes, Server Actions, or Zustand stores.

Export profile helpers:

```ts
type ExportProfileStatus = "valid" | "missing-target" | "planned-format";

interface ExportProfile {
  id: string;
  name: string;
  targetKind: "collection" | "set" | "theme"; // "set" is legacy
  targetId: string;
  format: "css" | "tailwind" | "json" | "style-dictionary";
  destination: string;
  updatedAt: string;
}

function resolveExportProfileStatus(
  profile: ExportProfile,
  sets: TokenCollection[],
  themes: Theme[]
): ExportProfileStatus;

function previewExportProfile(
  profile: ExportProfile,
  sets: TokenCollection[],
  themes: Theme[]
): ExportProfilePreview;
```

Figma Sync helpers:

```ts
function createFigmaSyncPayload(sets: TokenCollection[], themes: Theme[]): FigmaSyncPayload;
function parseFigmaSyncPayload(raw: string): { ok: true; payload: FigmaSyncPayload } | { ok: false; error: string };
function buildSyncDiff(currentSets: TokenCollection[], incomingPayload: FigmaSyncPayload): SyncDiff;
function figmaSnapshotToRozetta(snapshot: FigmaFileSnapshot): {
  sets: TokenCollection[];
  themes: Theme[];
  bindings: FigmaVariableBinding[];
};
function buildFigmaToRozettaSyncRun(input: {
  currentSets: TokenCollection[];
  snapshot: FigmaFileSnapshot;
  snapshotId?: string;
  now?: string;
}): { result: FigmaToRozettaResult; run: SyncRun };
function createRozettaToFigmaPayload(input: {
  sets: TokenCollection[];
  themes: Theme[];
  bindings: FigmaVariableBinding[];
}): RozettaToFigmaPayload;
```

Figma bridge Server Actions and local Route Handler:

```ts
interface FigmaBridgePairingCode {
  code: string;
  expiresAt: string;
}

function createFigmaBridgePairingCode(context: WorkspaceContext, ttlMs?: number): FigmaBridgePairingCode;
function resolveFigmaBridgePairingCode(code: string): WorkspaceContext;
function getFigmaSyncState(context?: WorkspaceContext): Promise<FigmaBridgeState>;
function receiveFigmaSnapshot(snapshot: FigmaFileSnapshot, context?: WorkspaceContext): Promise<ReceiveFigmaSnapshotResult>;
function previewFigmaToRozetta(snapshot: FigmaFileSnapshot, context?: WorkspaceContext): Promise<PreviewFigmaToRozettaResult>;
function applyFigmaSnapshotToRozettaDraft(snapshot: FigmaFileSnapshot, context?: WorkspaceContext): Promise<PreviewFigmaToRozettaResult>;
function prepareFigmaPayload(input?: {
  sets?: TokenCollection[];
  themes?: Theme[];
  context?: WorkspaceContext;
}): Promise<RozettaToFigmaPayload>;

POST /api/figma/snapshot // accepts FigmaFileSnapshot and optional X-Rozetta-Workspace-Code, returns ReceiveFigmaSnapshotResult
```

- `applyFigmaSnapshotToRozettaDraft` persists reviewed token/theme drafts into Supabase/Postgres. It does not export Git artifacts.
- `prepareFigmaPayload` reads from the DB-first workspace unless explicit sets/themes are provided.
- Plugin requests SHOULD send `X-Rozetta-Workspace-Code`; the Route Handler validates it into a `WorkspaceContext` before writing snapshots or sync runs.
- `figmaSnapshotToRozetta` preserves the Figma model: each Figma Collection becomes one Rozetta Collection and each Figma Mode becomes one Collection Mode. Groups are path-derived only.
- Semantic token diffs normalize Figma alias metadata and DTCG `{path}` aliases to the same target path before deciding `alias-changed` or `value-changed`.

Figma writeback adapter Server Actions (see [`figma-writeback.md`](./features/figma-writeback.md)):

```ts
type FigmaWritebackAdapterId = "plugin" | "figma-cli";
type FigmaWritebackReadinessState =
  | "unavailable"
  | "installed-not-connected"
  | "ready"
  | "running"
  | "timed-out"
  | "failed"
  | "misconfigured";

interface FigmaWritebackAdapterReadiness {
  id: FigmaWritebackAdapterId;
  readiness: FigmaWritebackReadinessState;
  detail?: string;
}

interface FigmaWritebackPlan {
  adapterId: FigmaWritebackAdapterId;
  syncRunId: string;
  operations: SyncOperation[];
  destructiveCount: number;
  dryRun: boolean;
}

interface FigmaWritebackResult {
  syncRunId: string;
  operations: SyncOperation[];
  succeeded: number;
  skipped: number;
  failed: number;
}

function getFigmaWritebackReadiness(): Promise<{
  adapters: FigmaWritebackAdapterReadiness[];
  activeAdapterId: FigmaWritebackAdapterId;
}>;

function previewFigmaWriteback(input: {
  adapterId: FigmaWritebackAdapterId;
  payload?: RozettaToFigmaPayload;
}): Promise<
  | { ok: true; plan: FigmaWritebackPlan; syncRun: SyncRun }
  | { ok: false; error: string }
>;

function applyFigmaWriteback(input: {
  adapterId: FigmaWritebackAdapterId;
  syncRunId: string;
}): Promise<
  | { ok: true; syncRun: SyncRun; result: FigmaWritebackResult }
  | { ok: false; error: string; syncRun?: SyncRun }
>;

function cancelFigmaWriteback(syncRunId: string): Promise<{ ok: boolean; error?: string }>;
```

- The `plugin` adapter MUST be available in any runtime; the `figma-cli` adapter MUST be disabled in hosted/Vercel runtime.
- `previewFigmaWriteback` MUST persist a `SyncRun` in `direction: "rozetta-to-figma"` and `status: "draft"`.
- `applyFigmaWriteback` MUST revalidate the workspace draft before mutating Figma.
- Writeback actions MUST NOT mutate `tokens/*.edited.tokens.json`, `.rozetta/themes.json`, or any Git-versioned artifact.

Runtime DB repositories:

```ts
function getDb(): PostgresJsDatabase | PgliteDatabase;
function migrateRuntimeDatabase(): Promise<void>;
function getWorkspaceFromDb(): Promise<{
  sets: TokenCollection[];
  originalRoots: Record<string, DtcgGroup>;
  themes: Theme[];
  originalThemes: Theme[];
  themesFileExists: boolean;
}>;
function listTokenSetsFromDb(): Promise<TokenCollection[]>; // legacy function name
function upsertTokenSetInDb(set: TokenCollection): Promise<TokenCollection>; // legacy function name
function deleteTokenSetFromDb(setId: string): Promise<void>;
function patchTokenInDb(
  setId: string,
  path: string,
  patch: TokenPatch,
  modeId?: string
): Promise<TokenCollection | undefined>;
function listThemesFromDb(): Promise<Theme[]>;
function upsertThemeInDb(theme: Theme): Promise<Theme>;
function replaceThemesInDb(themes: Theme[]): Promise<Theme[]>;
function deleteThemeFromDb(themeId: string): Promise<void>;
function exportWorkspaceArtifacts(): Promise<{ tokenFiles: string[]; themesFile?: string; exportedAt: string }>;
function saveFigmaSnapshotToDb(snapshot: FigmaFileSnapshot, bindings?: FigmaVariableBinding[]): Promise<SavedFigmaSnapshot>;
function loadFigmaBridgeStateFromDb(): Promise<FigmaBridgeState>;
function saveSyncRunToDb(run: SyncRun): Promise<SyncRun>;
function saveGitHubPrDraftToDb(draft: GitHubPrDraft): Promise<GitHubPrDraft>;
function loadGitHubPrDraftsFromDb(limit?: number): Promise<GitHubPrDraft[]>;
```

- `token_sets` is the legacy table name for live Token Collections.
- `token_sets.modes`, `token_sets.mode_roots`, and `token_sets.active_mode_id` store Collection Mode metadata and DTCG roots.
- `token_index` indexes `collection_id`/legacy `set_id`, `mode_id`, and token `path`.
- `theme_sets` references `collection_id`/legacy `set_id`, `mode_id`, and `state`.
- `exportWorkspaceArtifacts` writes `tokens/<collection-id>/<mode-id>.tokens.json`.

GitHub bridge Server Actions (see [`github-bridge.md`](./features/github-bridge.md)):

```ts
type GitHubBridgeRuntimeState =
  | "unavailable-hosted"
  | "unavailable-no-repo"
  | "unavailable-missing-tools"
  | "ready"
  | "needs-auth"
  | "needs-clean-tree";

interface GitHubBridgeReadiness {
  runtime: GitHubBridgeRuntimeState;
  repoRoot?: string;
  gitVersion?: string;
  ghVersion?: string;
  ghAuth: boolean;
  branch?: string;
  ahead: number;
  behind: number;
  remote?: string;
  cleanOutsideAllowlist: boolean;
  detail?: string;
}

type GitHubPublishStepId =
  | "readiness"
  | "export-artifacts"
  | "verify-allowlist"
  | "switch-branch"
  | "stage"
  | "commit"
  | "push"
  | "gh-pr-create"
  | "finalize";

interface GitHubPublishPlan {
  draftId: string;
  syncRunId: string;
  steps: Array<{ id: GitHubPublishStepId; summary: string }>;
  stagedPaths: string[];
  branchName: string;
  baseBranch: string;
}

function getGitHubPrDrafts(): Promise<GitHubPrDraft[]>;
function createGitHubPrDraft(input?: {
  title?: string;
  body?: string;
  baseBranch?: string;
  payload?: Record<string, unknown>;
}): Promise<GitHubPrDraft>;
function updateGitHubPrDraft(
  draftId: string,
  patch: Partial<Pick<GitHubPrDraft, "title" | "body" | "baseBranch" | "headBranch" | "payload">>
): Promise<{ ok: true; draft: GitHubPrDraft } | { ok: false; error: string }>;
function deleteGitHubPrDraft(draftId: string): Promise<{ ok: true } | { ok: false; error: string }>;

function getGitHubBridgeReadiness(): Promise<GitHubBridgeReadiness>;
function previewGitHubPrPublish(draftId: string): Promise<
  | { ok: true; readiness: GitHubBridgeReadiness; plan: GitHubPublishPlan }
  | { ok: false; error: string }
>;
function publishGitHubPr(draftId: string): Promise<GitHubPublishResult & { syncRun?: SyncRun }>;
function cancelGitHubPrPublish(draftId: string): Promise<{ ok: boolean; error?: string }>;
```

- The bridge MUST be disabled in hosted/Vercel runtime. Server Actions MUST return a typed `runtime-unavailable` result rather than throwing.
- `publishGitHubPr` MUST run as a staged pipeline and persist one `SyncRun` (`direction: "github-pr"`) with one `SyncOperation` per step.
- Allowed binaries are exactly `git` and `gh`. Allowed subcommand sets are enumerated in [`github-bridge.md`](./features/github-bridge.md#process-execution).
- The bridge MUST NOT run destructive `git` commands (`push --force*`, `reset --hard`, `clean -fd`, history-rewriting commands) or any `git config` write.

AI OS helpers:

```ts
function buildAiWorkspaceContext(input: {
  sets: TokenCollection[];
  baselineSets?: TokenCollection[];
  themes: Theme[];
  brands: Brand[];
  components: DesignSystemComponent[];
  exportProfiles: ExportProfile[];
  git?: GitStatusSummary;
  operational?: OperationalContext;
  focus?: Partial<AiTaskContext>;
}): AiWorkspaceContext;

function createDeterministicAiProposal(input: AiCommandInput): AiPatchProposal;
function createModelAiProposal(input: {
  baseProposal: AiPatchProposal;
  provider: Pick<AiProviderConfig, "kind" | "model">;
  modelText: string;
}): AiPatchProposal;
function createDefaultAiConversation(now?: string): AiConversation;
function normalizeAiConversation(value: unknown): AiConversation;
function appendAiConversationMessages(
  conversation: AiConversation,
  messages: AiConversationMessage[],
  limit?: number
): AiConversation;
function createUserConversationMessage(input: {
  command: AiCommandInput;
  now?: string;
}): AiConversationMessage;
function createAssistantConversationMessage(input: {
  command: AiCommandInput;
  proposal: AiPatchProposal;
  patchQueued: boolean;
  reasoningSteps?: AiReasoningStep[];
  toolCalls?: AiReadOnlyToolCall[];
  now?: string;
}): AiConversationMessage;
function shouldQueueAiProposal(proposal: AiPatchProposal): boolean;
function validateAiPatch(proposal: AiPatchProposal, workspace: AiWorkspaceDraft): AiReviewResult;
function previewAiPatch(proposal: AiPatchProposal, workspace: AiWorkspaceDraft): AiReviewResult;
function applyAiPatchToWorkspaceDraft(proposal: AiPatchProposal, workspace: AiWorkspaceDraft): AiApplyResult;
function summarizeAiSession(input: { command: AiCommandInput; proposal: AiPatchProposal }): AiCommandSession;
function listSyncConnectors(): SyncConnector[];
```

These helpers MUST keep AI mutations structured as proposals. `src/lib/ai-os/registry.ts` is pure; provider calls live in `src/lib/ai-os/model.ts`.

### AI Data Contract (planned)

Files: *src/lib/ai-os/contract/***. Server-only; MUST NOT be imported by client components. See [`features/ai-data-contract.md`](./features/ai-data-contract.md).

```ts
// src/lib/ai-os/contract/operation-schema.ts
const AiPatchOperationSchema: z.ZodDiscriminatedUnion<"type", [...]>;
type AiPatchOperation = z.infer<typeof AiPatchOperationSchema>;

// src/lib/ai-os/contract/proposal-schema.ts
const AiPatchProposalSchema: z.ZodObject<...>; // operations.length ≤ 50
type AiPatchProposal = z.infer<typeof AiPatchProposalSchema>;

// src/lib/ai-os/contract/context-graph.ts
function buildAiContextGraph(ctx: AiWorkspaceContext): AiContextGraph;

// src/lib/ai-os/contract/serialize.ts
function serializeContextForPrompt(graph: AiContextGraph, focus: AiTaskContext): string;

// src/lib/ai-os/contract/tools.ts
const rozettaTools: {
  rozetta_search_tokens: Tool;
  rozetta_get_token: Tool;
  rozetta_recent_changes: Tool;
};
```

- `AiPatchOperationSchema` is the single source of truth for AI output shape. The hand-written `AiPatchOperation` union in *src/lib/workspace/types.ts* is replaced with `z.infer`.
- `buildAiContextGraph` is pure and deterministic; it MUST NOT call the serializer, the DB, or the filesystem.
- `serializeContextForPrompt` enforces a ≤200-token budget with relevance ordering (mentions > issue-source > recently-changed > by-tier > by-path) and produces byte-identical output for identical inputs.
- Retrieval tools (`rozetta_search_tokens`, `rozetta_get_token`, `rozetta_recent_changes`) are read-only. Each `execute` logs to `aiContextEvents` with `kind: "tool-call"`.

---

## 4b. Semantic intent (`dtcg/semantic.ts`)

Opt-in semantic layer stored under `$extensions["com.rozetta.semantic"]` (key `ROZETTA_SEMANTIC_EXT_KEY`). Pure, framework-free; preserved through serializer ops by invariant I11. See [`domain.md` §2.5](./domain.md#25-semantic-intent-first-class).

```ts
type SemanticTier = "primitive" | "semantic" | "component";

interface SemanticDescription { intent?: string; usage?: string; donts?: string[]; }

type TokenRelationKind = "backs" | "variant-of" | "pairs-with" | "replaces";
interface TokenRelation { kind: TokenRelationKind; target: string; } // target = dot path

interface SemanticTokenMetadata {
  tier: SemanticTier;
  role?: string;
  description?: SemanticDescription;   // complements the plain $description
  relations?: TokenRelation[];          // typed links beyond value aliases
  deprecated?: boolean;
  replacedBy?: string;
}

function getSemanticMeta(token: DtcgToken): SemanticTokenMetadata | null;
function setSemanticMeta(token: DtcgToken, meta: SemanticTokenMetadata): DtcgToken;
function inferSemanticTier(token: DtcgToken, ctx?: SemanticInferenceContext): SemanticTier;
function resolveTier(token: DtcgToken, ctx?: SemanticInferenceContext): SemanticTier; // explicit wins
function deriveRelations(set: TokenSet): Record<string, TokenRelation[]>; // inferred `backs`, read-only
```

- `getSemanticMeta`/`setSemanticMeta` validate and round-trip the metadata; malformed `description`/`relations` fields are dropped, never thrown (domain I12).
- `deriveRelations` infers `backs` edges from the alias graph (the aliased primitive backs the aliasing semantic); explicit `relations` win over inferred. It never mutates a token.
- Zod shapes: `rozettaSemanticMetadataSchema`, `rozettaSemanticDescriptionSchema`, `tokenRelationSchema` in *src/lib/dtcg/schema.ts* — exposed for downstream validators, not enforced inside the open `$extensions` record.

---

## 5. Tokens store (`useTokensStore`)

File: *src/lib/stores/tokens-store.ts*.

### 5.1 State

```ts
interface TokensState {
  sets: TokenCollection[];
  originals: Record<string, DtcgGroup>;
  activeSetId: string | undefined;            // "*" | <collection id> | undefined (legacy key)
  activeGroupPath: string;                    // "" for root
  searchQuery: string;
  selectedToken: { setId: string; path: string; isNew?: boolean } | undefined; // setId = collectionId
  multiSelection: Set<SelectionKey>;          // `${collectionId}::${path}`
}
```

Constants and helpers exported alongside the hook:

```ts
const ALL_SETS_ID = "*";
type SelectionKey = `${string}::${string}`;
function toSelectionKey(setId: string, path: string): SelectionKey;
function fromSelectionKey(key: SelectionKey): { setId: string; path: string };
```

### 5.2 Actions

| Action | Signature | Behavior |
|---|---|---|
| `hydrate` | `(sets: TokenCollection[], originalRoots?: Record<string, DtcgGroup>) => void` | Populate DB-loaded Collections, artifact `originals`, default `activeSetId` to `ALL_SETS_ID`. |
| `selectSet` | `(setId: string) => void` | Legacy name for selecting a Collection. Resets `activeGroupPath` and `multiSelection`. |
| `selectCollectionMode` | `(collectionId: string, modeId: string) => void` | Switch the active Mode for a Collection and reconcile invalid token selection. |
| `selectGroup` | `(groupPath: string) => void` | Drill into a group. Resets `multiSelection`. |
| `setSearchQuery` | `(query: string) => void` | Update the global token search. |
| `selectToken` | `(setId: string, path: string) => void` | Open the editor sheet for the given token. |
| `clearSelectedToken` | `() => void` | Close the editor sheet. |
| `toggleMultiSelection` | `(setId: string, path: string) => void` | Add/remove a single key. `setId` means Collection id. |
| `setMultiSelection` | `(keys: SelectionKey[]) => void` | Replace the entire selection. |
| `clearMultiSelection` | `() => void` | Empty the selection. |
| `deleteSelected` | `() => number` | Bulk delete; returns count of removed tokens. Reconciles `selectedToken`. |
| `patchToken` | `(setId, path, patch) => void` | Apply a `TokenPatch` to the active Mode root. Preserves `$extensions`. |
| `deleteToken` | `(setId, path) => void` | Remove a single token. Closes the sheet if it was open on that path. |
| `duplicateToken` | `(setId, path) => string \| undefined` | Insert a sibling named `<name>-copy` (or `-copy-2`, …). Returns the new path. |
| `moveToken` | `({ fromSetId, fromPath, toSetId, toPath }) => MoveResult` | Rename in place / move within set / move across sets. Validates collisions and illegal ancestry. |
| `replaceSetRoot` | `(setId, root) => void` | Replace the active Mode root for a Collection. |
| `importSet` | `(name, root, options?) => string` | Legacy action name for adding/replacing a Collection. `options.modes`, `options.modeRoots`, and `options.activeModeId` preserve mode-aware imports. Returns the Collection id. Marks dirty. |
| `createToken` | `(setId?: string) => string \| undefined` | Insert a `new-token` (or `new-token-2`, …) placeholder of type `color`, value `#000000`, into the active or first valid set. Selects it with `isNew: true`. Returns the new path. |
| `markClean` | `(setId) => void` | Snapshot current Collection roots into `originals[collectionId]` and `originals[collectionId:modeId]`. |
| `isDirty` | `(setId) => boolean` | Compare every Collection Mode root vs its artifact baseline. A Collection with no original baseline is dirty. |
| `dirtySetIds` | `() => string[]` | Convenience selector. |
| `saveAll` | `() => number` | Snapshot all Collections/Modes into `originals` after `saveWorkspaceArtifacts` succeeds. Returns the dirty count before save. |
| `discardSet` | `(setId) => boolean` | Revert one Collection to artifact baselines for all Modes and persist the reverted draft to DB. If there is no original baseline, remove it from DB. Reconciles selection. |
| `discardAll` | `() => number` | Revert every dirty set. Returns the count. |

### 5.3 `TokenPatch`

```ts
interface TokenPatch {
  $value?: DtcgValue;
  $type?: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}
```

Fields omitted from a patch are left untouched. Setting a field to `undefined` is NOT supported — pass an empty string / object explicitly if you want to clear something.

### 5.4 `MoveResult`

```ts
type MoveResult =
  | { ok: true; newPath: string }
  | { ok: false; error: string };
```

Failure modes (each surfaces a distinct `error` string):
- empty path
- source set / token missing
- target set missing
- collision with an existing path
- illegal ancestry (target ancestor is itself a token)

---

## 6. Themes store (`useThemesStore`)

File: *src/lib/themes/store.ts*.

### 6.1 State

```ts
interface ThemesState {
  themes: Theme[];
  originals: Theme[];
  activeThemeId: string | null;
}
```

### 6.2 Actions

| Action | Signature | Behavior |
|---|---|---|
| `hydrate` | `(themes: Theme[], fileExists?: boolean, originalThemes?: Theme[]) => void` | Load DB themes and artifact baselines; if absent and legacy `localStorage` themes exist, migrate them to DB. |
| `createTheme` | `(name: string, description?: string) => Theme` | Adds an empty theme with a unique id. Selects it. |
| `updateTheme` | `(id, patch) => void` | Patch `name` / `description`. Bumps `updatedAt`. |
| `deleteTheme` | `(id) => void` | Remove the theme. If active, select the next one or null. |
| `duplicateTheme` | `(id) => Theme \| undefined` | Deep clone with `<name> Copy`. Selects the copy. |
| `upsertThemes` | `(themes: Theme[]) => void` | Merge incoming themes by id and persist the live draft to DB. |
| `setThemeSets` | `(themeId, sets: ThemeSetRef[]) => void` | Replace the full Collection reference list (used by drag-to-reorder). |
| `toggleSetMode` | `(themeId, setId) => void` | Legacy action name for cycling a Collection's inclusion: missing→enabled, enabled→disabled, disabled→enabled. |
| `selectTheme` | `(id \| null) => void` | UI focus. |
| `isDirty` | `(id) => boolean` | Compare current theme vs artifact baseline. |
| `dirtyThemeIds` | `() => string[]` | Return changed, new, or deleted theme ids relative to artifacts. |
| `saveAll` | `() => number` | Snapshot current themes into `originals` after artifact export succeeds. |
| `discardAll` | `() => number` | Revert themes to artifact baselines and persist the reverted draft to DB. |

---

## 7. Design system store (`useDesignSystemStore`)

File: *src/lib/design-system/store.ts*.

### 7.1 State

```ts
interface DesignSystemState {
  brands: Brand[];
  components: DesignSystemComponent[];
  activeBrandId: string | null;
  activeComponentId: string | null;
}
```

### 7.2 Actions

| Action | Signature | Behavior |
|---|---|---|
| `hydrate` | `({ brands, components }) => void` | Normalize server-loaded `.rozetta/brands.json` and `.rozetta/components.json` data. |
| `createBrand` | `(name, baseBrandId?) => Brand` | Compatibility action for paused Brands; not called by active UI. |
| `updateBrand` | `(id, patch) => void` | Compatibility action for paused Brands; not called by active UI. |
| `duplicateBrand` | `(id) => Brand \| undefined` | Compatibility action for paused Brands; not called by active UI. |
| `deleteBrand` | `(id) => void` | Compatibility action for paused Brands; not called by active UI. |
| `selectBrand` | `(id \| null) => void` | UI focus. |
| `createComponent` | `(name, category?) => DesignSystemComponent` | Create a draft component, persist it, and select it. |
| `updateComponent` | `(id, patch) => void` | Patch component metadata/bindings, normalize arrays/status, persist to `.rozetta/components.json`. |
| `duplicateComponent` | `(id) => DesignSystemComponent \| undefined` | Clone a component as draft, persist it, and select the copy. |
| `deleteComponent` | `(id) => void` | Delete the component, remove it from brand component references, and persist both registries. |
| `selectComponent` | `(id \| null) => void` | UI focus. |

---

## 8. Theme resolver

File: *src/lib/themes/resolver.ts*.

```ts
interface ConflictEntry {
  path: string;
  setIds: string[];   // contributing Collections, in merge order
  winnerId: string;   // which one won
}

interface ThemeResolveResult {
  merged: TokenCollection;   // virtual; id = "__theme__" + theme.id
  conflicts: ConflictEntry[];
}

function resolveTheme(theme: Theme, allSets: TokenCollection[]): ThemeResolveResult;
```

Behavior:
1. Walks `theme.sets` in order, skipping `state === "disabled"` (legacy `mode === "disabled"` is equivalent).
2. For each remaining ref, materializes the referenced `collectionId + modeId`, flattens it, and writes every token into a `path → token` map.
3. Tracks which Collection ids contributed each path; paths with 2+ contributors become conflicts.
4. Reconstructs a `DtcgGroup` from the final flat map.

Missing Collection ids are silently ignored (the theme stays valid).

---

## 9. DTCG library

### 9.1 Parser (*src/lib/dtcg/parser.ts*)

```ts
function isAliasValue(v: DtcgValue): boolean;
function aliasPath(v: DtcgValue): string | undefined;
function walkTokens(
  root: DtcgGroup,
  parentPath?: string,
  inheritedType?: DtcgType
): Generator<{ path: string; token: DtcgToken; resolvedType: DtcgType }>;
function walkGroups(
  root: DtcgGroup,
  parentPath?: string,
  inheritedType?: DtcgType
): Generator<{ path: string; group: DtcgGroup; resolvedType?: DtcgType }>;
function flattenTokens(set: TokenCollection): FlatToken[];
function flattenGroups(set: TokenCollection): FlatGroup[];
function listChildren(node: DtcgGroup): { tokens: DtcgToken[]; groups: DtcgGroup[] };
function getNodeAtPath(root: DtcgGroup, path: string): DtcgToken | DtcgGroup | undefined;
```

### 9.2 Serializer (*src/lib/dtcg/serializer.ts*)

```ts
function serializeTokenSet(set: TokenCollection): string;
function cloneGroup(root: DtcgGroup): DtcgGroup;
function setTokenAtPath(root: DtcgGroup, path: string, patch: TokenPatch): DtcgGroup;
function insertTokenAtPath(root: DtcgGroup, path: string, token: DtcgToken): DtcgGroup;
function deleteTokenAtPath(root: DtcgGroup, path: string): DtcgGroup;
```

All functions are pure (return a new tree; do not mutate input). They MUST preserve `$extensions` and reject illegal structures (token-as-ancestor, etc.).

### 9.3 Resolver (*src/lib/dtcg/resolver.ts*)

```ts
interface ResolveOptions { currentSetId: string; sets: TokenCollection[] }
interface ResolutionStep {
  setId: string;
  path: string;
  source: "dtcg-alias" | "figma-alias" | "literal";
}
interface ResolvedToken {
  value: DtcgValue | undefined;
  chain: ResolutionStep[];
  error?: "cycle" | "not-found" | "invalid";
}

function resolveToken(setId: string, path: string, opts: ResolveOptions): ResolvedToken;
function readFigmaAlias(t: DtcgToken): FigmaAliasData | undefined;
function figmaPathToDtcg(path: string): string;
```

### 9.4 Format (*src/lib/dtcg/format.ts*)

```ts
function formatTokenValue(value: DtcgValue, $type?: DtcgType): string;
function formatColorForCss(value: DtcgValue): string | undefined;
```

### 9.5 Schema (*src/lib/dtcg/schema.ts*)

```ts
const dtcgFileSchema: z.ZodType<DtcgFileInput>;
function parseTokenFile(raw: string):
  | { ok: true; data: DtcgGroup }
  | { ok: false; error: string };
```

---

## 10. Exporters

File: *src/lib/exporters/index.ts*.

```ts
type ExportFormatId = "css" | "tailwind" | "json";

interface ExportFormat {
  id: ExportFormatId;
  label: string;
  description: string;
  filename: (setName: string) => string;
  language: "css" | "javascript" | "json";
}

const EXPORT_FORMATS: ExportFormat[];

function exportCss(set: TokenCollection, sets: TokenCollection[]): string;
function exportTailwind(set: TokenCollection, sets: TokenCollection[]): string;
function exportJsonFlat(set: TokenCollection, sets: TokenCollection[]): string;
function runExport(format: ExportFormatId, set: TokenCollection, sets: TokenCollection[]): string;
```

All exporters:
- Resolve aliases transitively. If resolution fails (cycle / not-found / invalid), the token is dropped from output.
- Output is deterministic: tokens are sorted by path before writing.
- Numbers heuristically gain a `px` suffix when the path looks length-ish (`/(?:^|\.)(?:radius|width|height|size|spacing|gap|padding|margin|inset|offset|stroke|thickness|corner|scale)\b/i`). Explicit `dimension` values keep their declared unit.

---

## 11. Component contracts (selected)

### 11.1 `TokensProvider`

```tsx
<TokensProvider initialSets={sets}>{children}</TokensProvider>
```

Calls `useTokensStore.hydrate(initialSets)` once on mount.

### 11.2 `TokenEditorSheet`

Driven entirely by `useTokensStore.selectedToken`. No props. Closing the sheet calls `clearSelectedToken`. Title and submit copy switch to "Create Token" when `selected.isNew === true`.

### 11.3 `ExportSheet` / `UploadSheet`

```tsx
<ExportSheet open={boolean} onOpenChange={(open: boolean) => void} />
<UploadSheet open={boolean} onOpenChange={(open: boolean) => void} />
```

### 11.4 `AppSidebar`

```tsx
<AppSidebar onOpenExport?: () => void; onOpenUpload?: () => void; onOpenAi?: () => void; />
```

The sidebar itself does not own sheet state. Routes pass these callbacks down from their `*Shell` component.

---

## 12. MCP CLI

Files: *src/mcp/server.ts*, *src/mcp/tools.ts*, *src/mcp/workspace.ts*.

```ts
script "pnpm mcp" // runs stdio MCP server
```

Tools:
- `list_collections`
- `list_collection_modes`
- `list_sets` (legacy alias)
- `list_themes`
- `list_brands`
- `list_components`
- `search_tokens`
- `resolve_alias`
- `validate_workspace`
- `semantic_diff`
- `validate_design_system`
- `design_system_diff`
- `preview_export`
- `propose_patch`
- `propose_brand`
- `propose_component`
- `propose_design_system_patch`
- `get_workspace_context`
- `run_ai_proposal`
- `list_ai_patches`
- `preview_ai_patch`
- `validate_ai_patch`
- `list_sync_connectors`
- `connector_readiness`
- `figma_bridge_state`
- `list_github_pr_drafts`

MCP code MUST NOT import React components, Next routes, or Zustand stores. Proposal tools return structured proposals only and MUST NOT mutate files. New tools MUST use Collection/Mode vocabulary; legacy `set` names may remain only as compatibility aliases.
