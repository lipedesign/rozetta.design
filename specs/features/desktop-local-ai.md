# Feature: Desktop Local AI

## Status
planned (Phase 0.5 done 2026-05-12)

### Status — 2026-05-12
Phase 0.5 (Local web bridge validation) is **done**. The server-only adapter boundaries, runtime guard, readiness checks, and non-streaming local run path now exist in the current Next.js app via [Local Agent Bridge](./local-agent-bridge.md).

Phases 4 (Claude Code Local) and 5 (Codex Local) are now **partially absorbed** by the Phase 0.5 web-based implementation: their detection, safe execution, redaction, and proposal-conversion contracts are in place. Full desktop integration (Electron main-process reuse of these adapters, signed packaging, sandboxing) remains for Electron Phase 1+.

## Purpose
Turn Rozetta into a desktop-capable, AI-first workspace that can reuse the user's already-authenticated local agent tools, such as Claude Code and Codex, without turning ChatGPT/Claude subscriptions into an unofficial cloud API passthrough. The desktop app preserves Rozetta's reviewed-mutation model: local agents may reason over the Supabase-backed workspace and propose changes, but only Rozetta-owned review/apply flows mutate tokens, themes, brands, components, release notes, export profiles, or Git artifacts.

## User stories
- As a Rozetta user with Claude Max, I can use my locally authenticated Claude Code installation from inside the Rozetta chat without pasting an Anthropic API key.
- As a Rozetta user with a ChatGPT/Codex plan, I can use my locally authenticated Codex installation from inside the Rozetta chat without pasting an OpenAI API key.
- As a security-conscious maintainer, I can understand exactly which local capabilities Rozetta Desktop exposes to the renderer, local agents, provider CLIs, and MCP tools.
- As a design-system maintainer, I can ask AI to inspect my local workspace and receive reviewable proposals, not automatic mutations.
- As a future SaaS operator, I can distinguish desktop subscription-backed local usage from Vercel/cloud usage that requires BYOK, Rozetta-hosted billing, or a supported provider API.

## Behavior
1. Rozetta Desktop MUST use Electron as the canonical desktop shell for MVP and future desktop scale.
1.1. Tauri, native rewrites, or other desktop shells MUST NOT be introduced for this feature unless a future spec deliberately supersedes this decision.
2. Rozetta Desktop MUST reuse the existing product UI as the primary renderer experience.
3. Rozetta Desktop MUST keep the DB-first workspace model from [constitution §1](../constitution.md#1-git-native-cloud-backed): Supabase/Postgres is the canonical live workspace, while Git-native JSON files remain portable artifacts generated on Save/PR.
4. Rozetta Desktop MUST run privileged Node/Electron work outside the renderer process.
5. Rozetta Desktop MUST expose privileged desktop capabilities to the renderer only through typed, allowlisted IPC APIs.
6. Rozetta Desktop MUST NOT enable arbitrary shell execution from the renderer.
7. Rozetta Desktop MUST NOT expose Node APIs, filesystem APIs, environment variables, process handles, or provider credentials directly to browser-rendered code.
8. Desktop local agent providers MUST be represented separately from API-key providers. A subscription-backed local provider MUST NOT be modelled as `anthropic` or `openai` API usage.
9. The initial desktop provider list SHOULD include:
   - `deterministic`: existing deterministic fallback.
   - `openai`: OpenAI API key through Vercel AI SDK.
   - `anthropic`: Anthropic API key through Vercel AI SDK.
   - `openai-compatible-local`: LM Studio, Ollama, or another user-configured OpenAI-compatible local endpoint.
   - `claude-code-local`: local Claude Code / Claude Agent SDK runtime authenticated outside Rozetta.
   - `codex-local`: local Codex CLI / SDK runtime authenticated outside Rozetta.
10. `claude-code-local` MUST require a local Claude Code installation and an already-authenticated user session.
11. `codex-local` MUST require a local Codex installation and an already-authenticated user session.
12. Rozetta MUST NOT ask users to paste Claude.ai, ChatGPT, Claude Code, or Codex account passwords.
13. Rozetta SHOULD NOT ask users to paste subscription OAuth tokens such as Claude Code or Codex session tokens. If a future advanced flow supports token paths, it MUST be explicitly local-only, encrypted when possible, redacted everywhere, and disabled for cloud deployments.
14. Rozetta MUST detect local tool readiness through safe status checks that do not print secrets.
15. Rozetta MUST show provider readiness states: unavailable, installed-but-unauthenticated, ready, misconfigured, running, timed-out, and failed.
16. Local agent providers MUST run only on desktop/local deployments. They MUST be disabled in Vercel/serverless deployments.
17. When running on Vercel or another hosted environment, Rozetta MUST NOT attempt to call the user's local `claude`, `codex`, LM Studio, Ollama, Keychain, shell profile, or subscription session.
18. Hosted Rozetta chat MAY support API keys, Vercel AI Gateway, Rozetta-hosted billing, or remote MCP integrations, but MUST NOT promise ChatGPT/Claude subscription passthrough unless an official provider contract supports it.
19. Before Electron exists, the existing local Next.js app MAY support `claude-code-local` and `codex-local` through server-only local actions or route handlers, as long as those providers remain disabled for hosted/Vercel deployments.
20. The pre-Electron local bridge is a validation path, not the final desktop shell. Its provider adapter boundaries SHOULD be reusable by the later Electron main process.
21. Local web/dev provider execution MUST follow the same process, filesystem, redaction, prompt-injection, and proposal-review controls as Rozetta Desktop.
22. All AI outputs that imply workspace changes MUST be converted to `AiPatchProposal` objects.
23. AI MUST NOT mutate tokens, themes, brands, components, release notes, export profiles, Figma snapshots, PR drafts, or Git artifacts automatically.
24. Applying an AI proposal MUST require an explicit Rozetta UI action after preview.
25. Applying token changes MUST continue to use serializer/store contracts, including `setTokenAtPath`, `insertTokenAtPath`, or `deleteTokenAtPath`.
26. Local agents MAY receive read-only workspace context through Rozetta-owned MCP/tools.
27. Local agents MUST receive the minimum context needed for the selected task and context toggles.
28. Rozetta MUST mark external documents, imported JSON, Figma snapshots, Git diffs, token descriptions, and user attachments as untrusted prompt context.
29. Rozetta MUST treat provider model text as untrusted until it is parsed, validated, previewed, and accepted by Rozetta-owned code.
30. Rozetta MUST retain deterministic fallback behavior when no usable provider is ready.
31. Rozetta SHOULD stream local agent responses only after the non-streaming path is stable and covered by tests.
32. Rozetta Desktop MAY expose a local companion HTTP server for internal renderer-to-main communication only if it binds to loopback, uses per-session authorization, verifies origin, and never exposes privileged routes to the LAN.
33. Rozetta Desktop MUST fail closed. If local agent setup, auth detection, IPC validation, or proposal validation fails, Rozetta returns a user-visible error and does not execute fallback shell commands.
34. Rozetta MUST make the local/cloud distinction visible in Settings so users understand whether AI calls run via API key, local LLM, local subscription-backed tool, or hosted provider.

## Data
- Extend `AiProviderKind` with local-provider kinds only after the public contract is updated in [contracts §1.8](../contracts.md#18-ai-os-actions).
- Extend `AiProviderConfig` with local runtime metadata without storing provider credentials in Git-versioned files or the Supabase/Postgres runtime DB.
- Continue storing API-key settings only in `.rozetta/ai-settings.local.json`.
- Desktop local provider settings SHOULD store only non-secret configuration, such as selected runtime, executable path override, model/profile label, timeout, and enabled state.
- Desktop local provider readiness MAY be cached in memory, but MUST be recomputed before execution.
- Local execution logs MUST redact environment variables, API keys, OAuth tokens, bearer tokens, file paths outside the workspace when not needed, and command stdout/stderr lines that match secret patterns.
- AI patch proposals MUST continue to persist in `.rozetta/ai-patches.json`.
- AI sessions MUST continue to persist in `.rozetta/ai-sessions.json`.
- AI chat conversation history MUST continue to persist in `.rozetta/ai-conversations.json`.
- The Supabase/Postgres runtime DB MUST NOT store provider secrets.
- The Git-native artifacts remain `tokens/*.edited.tokens.json`, `.rozetta/themes.json`, `.rozetta/brands.json`, `.rozetta/components.json`, `.rozetta/export-profiles.json`, `.rozetta/ai-conversations.json`, `.rozetta/ai-patches.json`, and `.rozetta/ai-sessions.json`.

## UI
- Route: `/settings`, AI Providers tab.
- Route: `/ai`, AI Assistant Home.
- Component: *src/components/settings/studio-settings.tsx*.
- Component: *src/components/ai/ai-assistant-home.tsx*.
- Component: *src/components/ai/ai-review-queue.tsx*.
- Desktop shell: future *desktop/*** or *electron/*** entrypoint.
- Settings MUST distinguish:
  - API key providers.
  - Local OpenAI-compatible providers.
  - Local agent providers.
  - Deterministic fallback.
- Local agent provider cards MUST show:
  - runtime name.
  - detection status.
  - authentication status when safely detectable.
  - command path or "auto-detect".
  - timeout.
  - "test connection" action.
  - last safe diagnostic message.
- The UI MUST NOT show raw provider tokens, full shell environment, or unredacted command output.
- The UI SHOULD include local-only copy such as "Uses your locally authenticated tool. Not available on hosted deployments."
- The UI MUST NOT describe Claude Max, ChatGPT Plus/Pro, or Codex subscription support as API billing.

## Security model

### Protected assets
1. Local workspace files, including `tokens/**`, `.rozetta/**`, local secret files, and any local runtime cache used by desktop builds.
2. Provider credentials, including OpenAI API keys, Anthropic API keys, Claude Code sessions, Codex sessions, local LLM tokens, and shell environment secrets.
3. User account state managed by external tools, including Claude Code, Codex, Git, GitHub CLI, SSH agents, and OS keychains.
4. Git history and working tree state.
5. The user's broader filesystem outside the selected Rozetta workspace.
6. AI prompt context that may contain proprietary token names, brand data, component metadata, Figma snapshots, release drafts, and attachments.
7. IPC and local HTTP channels between renderer, main process, local bridge, and provider runtimes.

### Trust boundaries
1. Renderer UI is untrusted relative to Electron main.
2. Electron preload is trusted but MUST be narrow and auditable.
3. Electron main / local bridge is privileged and owns filesystem/process access.
4. Provider CLIs/SDKs are semi-trusted external binaries and MUST be isolated by capability and working directory.
5. AI model output is untrusted text until Rozetta validates it.
6. Workspace content is user-controlled and may contain prompt injection.
7. Vercel/serverless deployment is a different trust domain and MUST NOT inherit desktop-only capabilities.

### Electron hardening requirements
1. `contextIsolation` MUST be enabled.
2. `nodeIntegration` MUST be disabled for renderer windows.
3. `sandbox` SHOULD be enabled for renderer windows unless a documented Electron limitation blocks it.
4. Remote module usage MUST be disabled.
5. Navigation MUST be restricted to Rozetta-owned local URLs and explicitly allowed external documentation links.
6. New-window handling MUST deny by default and route external links through the OS browser only after URL validation.
7. A restrictive Content Security Policy MUST be applied.
8. Renderer-to-main IPC MUST use named channels with Zod-validated payloads and typed responses.
9. IPC handlers MUST reject unknown keys, oversized payloads, and requests that reference paths outside the active workspace.
10. Preload MUST expose a minimal `window.rozettaDesktop` API instead of raw `ipcRenderer`.
11. DevTools MUST be disabled in production builds unless explicitly launched in a developer mode.
12. Electron auto-update, if added, MUST use signed releases and MUST NOT execute unsigned downloaded code.

### Filesystem controls
1. Rozetta Desktop MUST require an explicit workspace root.
2. Filesystem reads/writes MUST be scoped to the active workspace unless a specific, reviewable import/export dialog grants access.
3. Paths MUST be normalized and checked against traversal outside the workspace.
4. Symlink traversal MUST be treated carefully: writes MUST resolve real paths and reject targets outside the workspace.
5. Canonical `tokens/<collection>/<mode>.tokens.json` artifacts are generated only through reviewed Save/PR flows.
6. Runtime DB and local settings remain ignored by Git.
7. Provider CLI executable auto-detection MAY search common install paths, but MUST NOT recursively scan the full filesystem.

### Process execution controls
1. Rozetta MUST use `spawn`/SDK APIs without `shell: true`.
2. Rozetta MUST execute only allowlisted binaries for local providers, such as `claude`, `codex`, or user-approved absolute paths.
3. Rozetta MUST pass arguments as arrays, not interpolated shell strings.
4. Rozetta MUST use the workspace root as the working directory unless the provider requires a safer temp directory.
5. Rozetta MUST set timeouts for readiness checks and AI runs.
6. Rozetta MUST kill child processes and descendants on timeout, cancellation, app shutdown, or provider switch.
7. Rozetta MUST limit stdout/stderr captured from child processes.
8. Rozetta MUST redact captured output before persistence or UI display.
9. Rozetta MUST provide a cancellation path for long-running agent turns.
10. Rozetta MUST NOT pass the entire process environment to provider CLIs by default. It SHOULD pass a minimal allowlisted environment and preserve only required variables such as `PATH`, `HOME`, `SHELL`, provider-specific variables, and OS locale values.
11. Local agent execution MUST NOT run package managers, Git write commands, or arbitrary scripts unless a future reviewed tool explicitly grants that capability.
12. The first version of `claude-code-local` and `codex-local` SHOULD be chat/proposal oriented, not autonomous code-editing oriented.

### AI and prompt-injection controls
1. Prompt assembly MUST label workspace content as data, not instructions.
2. Prompt assembly MUST include a system rule that only Rozetta-owned tools can apply changes.
3. Tool calls exposed to agents MUST be read-only by default.
4. Mutation-capable tools MUST return reviewable proposals only.
5. AI-generated JSON MUST be parsed with strict schemas before becoming an `AiPatchProposal`.
6. Invalid model output MUST stay in chat as explanation or error and MUST NOT enter the patch queue.
7. Model suggestions that reference unknown Collection ids, paths, brands, components, or export profiles MUST fail validation.
8. Destructive operations MUST show clear preview lines before apply.
9. Apply MUST validate against the current workspace draft, not the stale draft used when the proposal was generated.
10. Rozetta MUST warn when proposal validation changed because the workspace moved on.

### Network controls
1. Rozetta Desktop MUST NOT add telemetry or analytics.
2. API-key providers MAY call their configured provider endpoint.
3. Local OpenAI-compatible providers SHOULD default to loopback URLs.
4. Non-loopback local-provider URLs MUST be visibly marked as remote and require explicit user configuration.
5. Local companion HTTP endpoints MUST bind to `127.0.0.1` or `::1`, not `0.0.0.0`.
6. Local companion HTTP endpoints MUST require an unguessable per-session token.
7. Local companion HTTP endpoints MUST reject unexpected `Origin` and `Host` headers.
8. Hosted/Vercel deployments MUST not expose desktop bridge routes.

## Implementation plan

### Phase 0 - Spec and contracts
1. Add this feature spec.
2. Decide whether desktop local providers extend `AiProviderKind` directly or use a separate `AiRuntimeKind`.
3. Update [contracts §1.8](../contracts.md#18-ai-os-actions) before adding exported settings/action signatures.
4. Update [architecture §1](../architecture.md#1-layers) when the desktop/local bridge layer is introduced.
5. Record Electron as the desktop shell of record in [architecture §1](../architecture.md#1-layers) when the first desktop entrypoint is added.

### Phase 0.5 - Local web bridge validation
Detailed implementation contract: [Local Agent Bridge](./local-agent-bridge.md).

1. Add server-only local agent adapter boundaries that can run in the current local Next.js app.
2. Guard local agent providers behind an explicit local runtime check.
3. Disable local agent providers when `VERCEL`, production hosted flags, or serverless deployment indicators are present.
4. Add readiness checks for local `claude` and `codex` without exposing credentials.
5. Add a non-streaming local run path that converts provider output into chat messages and reviewable proposals.
6. Keep this bridge implementation reusable by the future Electron main process.
7. Do not introduce Electron packaging in this phase.

### Phase 1 - Desktop shell spike
1. Add an Electron entrypoint without changing existing Next routes.
2. Run the existing UI inside an Electron window.
3. Disable Node integration and expose no privileged API yet.
4. Package a developer build only.
5. Verify tokens/themes still load from the Supabase/Postgres runtime DB.
6. Do not add a parallel Tauri/native shell during the spike.

### Phase 2 - Secure desktop bridge
1. Add a typed preload API.
2. Add main-process IPC handlers for provider readiness only.
3. Add Zod validation for every IPC payload.
4. Add path scoping helpers for workspace paths.
5. Add tests for path traversal, unknown IPC channels, oversized payloads, and redaction.

### Phase 3 - Local OpenAI-compatible provider
1. Add `openai-compatible-local` settings.
2. Default to loopback base URLs, such as LM Studio or Ollama-compatible endpoints.
3. Keep the Vercel AI SDK path where possible.
4. Add readiness checks and a non-streaming test request.
5. Ensure failures fall back to deterministic mode without losing the chat message.

### Phase 4 - Claude Code Local provider
1. Detect `claude` safely.
2. Detect authentication readiness with a command that does not reveal secrets.
3. Add a non-streaming local agent run path.
4. Convert agent output to chat messages and reviewable proposals.
5. Do not store Claude account credentials, passwords, or session tokens.
6. Mark this provider desktop-only.

### Phase 5 - Codex Local provider
1. Detect `codex` safely.
2. Detect authentication readiness with a command that does not reveal secrets.
3. Add a non-streaming local agent run path.
4. Convert agent output to chat messages and reviewable proposals.
5. Do not store ChatGPT/Codex account credentials, passwords, or session tokens.
6. Mark this provider desktop-only.

### Phase 6 - Packaging and release controls
1. Add platform packaging only after the bridge has tests.
2. Add code signing and notarization for macOS before distributing beyond development.
3. Add production CSP and navigation restrictions.
4. Add a security checklist to release QA.
5. Add a first-run screen explaining local provider permissions.
6. Scale the desktop product by hardening Electron packaging, updates, IPC, and sandboxing rather than rewriting the shell.

### Phase 7 - Hosted boundary
1. Ensure hosted/Vercel builds hide desktop-only providers.
2. Ensure hosted/Vercel builds never import Electron or local bridge modules.
3. Document hosted chat options separately: BYOK, Vercel AI Gateway, Rozetta-hosted billing, or remote MCP.
4. Keep subscription-backed local providers out of hosted billing copy.

## Acceptance checks
1. `pnpm lint` passes.
2. `pnpm exec tsc --noEmit` passes.
3. Electron production windows have `nodeIntegration: false` and `contextIsolation: true`.
4. Renderer cannot call arbitrary IPC channels.
5. Renderer cannot execute arbitrary shell commands.
6. Renderer cannot read arbitrary files outside the workspace.
7. Local provider execution uses `spawn`/SDK calls without shell interpolation.
8. Local provider logs redact known secret patterns.
9. Hosted/Vercel runtime does not bundle Electron main/preload code.
10. Hosted/Vercel runtime does not show `claude-code-local` or `codex-local` as selectable providers.
11. Claude/Codex local provider failure produces a safe error and deterministic fallback remains available.
12. AI-generated mutations still enter the review queue before apply.
13. Applying a proposal validates against the current workspace draft.
14. No provider secret is written to Git-versioned artifacts or the Supabase/Postgres runtime DB.
15. No Tauri/native desktop entrypoint is introduced for this feature.
16. The pre-Electron local web bridge is disabled in hosted/Vercel runtime.

## Out of scope
- Using Claude Max, Claude Pro, ChatGPT Plus/Pro, or Codex subscriptions as a hosted Rozetta SaaS backend.
- Asking users for Claude.ai or ChatGPT passwords.
- Automating the Claude.ai or ChatGPT web UI with cookies/session scraping.
- Shipping NanoClaw as a required runtime dependency.
- Autonomous AI mutation without review.
- Broad Git write workflows beyond existing reviewed artifact flows.
- Multi-user accounts, team permissions, cloud billing, and organization policy management.
- Remote desktop control of the user's local machine from Vercel-hosted Rozetta.
- Replacing Electron with Tauri or a native shell during this feature.

## Open questions
- Should desktop local providers extend `AiProviderKind` or live under a separate `AiRuntimeKind` with provider-specific adapters?
- Which local provider should ship first: `claude-code-local`, `codex-local`, or `openai-compatible-local`?
- Should local agent subprocesses run in an additional sandbox/container layer for high-risk workspaces?
- How should Rozetta sign, notarize, and auto-update desktop builds?
- Should a future Rozetta Cloud product support a companion local daemon for hosted UI to local provider bridging, or should hosted UI stay strictly API/BYOK/Gateway based?
