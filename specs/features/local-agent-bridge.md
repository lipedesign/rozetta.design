# Feature: Local Agent Bridge

## Status
partial

### Status — 2026-05-12
Phase 0.5 implementation landed inside the current Next.js app:
- Two server-only adapters (`claude-code-local`, `codex-local`) live under *src/lib/ai-os/local-agent/*.
- The runtime guard rejects Vercel and Edge runtimes; hosted builds expose neither provider.
- The Settings UI exposes a "Local providers" section with a readiness check, optional executable path override, and "Test connection".
- Remaining for full coverage: full structured-proposal validation, streaming output, and Electron packaging — tracked in [Desktop Local AI](./desktop-local-ai.md) Phase 1+.

## Purpose
Validate Claude Code Local and Codex Local inside the current local Next.js app before packaging Rozetta as Electron. This bridge lets a local Rozetta server call already-authenticated local tools (`claude`, `codex`) while keeping browser-rendered code unprivileged, disabling the feature in hosted/Vercel deployments, and preserving Rozetta's proposal-review safety model.

This feature implements the pre-Electron validation path described in [Desktop Local AI](./desktop-local-ai.md#phase-05---local-web-bridge-validation). It is not a replacement for the future Electron shell; it is the adapter and safety layer that Electron should later reuse from its main process.

## User stories
- As a Rozetta user with Claude Max, I can run Rozetta locally and ask the in-app chat to use my authenticated `claude` CLI without pasting an Anthropic API key.
- As a Rozetta user with a ChatGPT/Codex plan, I can run Rozetta locally and ask the in-app chat to use my authenticated `codex` CLI without pasting an OpenAI API key.
- As a maintainer, I can validate local subscription-backed AI providers before investing in Electron packaging.
- As a security reviewer, I can prove local agent execution is unavailable in hosted/Vercel builds and cannot be triggered from untrusted browser code.
- As a design-system maintainer, I can review every AI-suggested workspace mutation before applying it.

## Definitions
- **Local runtime**: Rozetta running on the user's machine through `pnpm dev`, `next start`, or another self-hosted Node process with access to local CLI tools.
- **Hosted runtime**: Rozetta running on Vercel, serverless infrastructure, or any remote environment that does not have access to the user's machine.
- **Local agent bridge**: Server-only code that detects local tools, runs approved agent commands, redacts output, and converts results into Rozetta chat messages/proposals.
- **Provider adapter**: A runtime-specific implementation for `claude-code-local`, `codex-local`, or a future local tool.
- **Readiness check**: A short, bounded, non-secret command used to determine whether a local tool is installed and authenticated.
- **Agent turn**: One bounded local provider execution triggered by `runAiCommand`.

## Behavior
1. The local agent bridge MUST run only in server-only code.
2. Browser-rendered components MUST NOT import bridge modules directly.
3. Client UI MUST access the bridge only through existing AI Server Actions or future server-only action wrappers.
4. The bridge MUST be disabled in hosted/Vercel runtime.
5. Hosted runtime detection MUST check explicit deployment indicators, including `VERCEL`, `NEXT_RUNTIME === "edge"`, and any future Rozetta-hosted flags.
6. If hosted runtime is detected, local providers MUST be hidden or marked unavailable and execution MUST return deterministic fallback or a safe configuration error.
7. The bridge MUST NOT require Electron.
8. The bridge MUST NOT introduce Electron packaging, preload APIs, IPC, auto-update, signing, or desktop windows.
9. Bridge modules SHOULD live under *src/lib/ai-os/local-agent/*** so the future Electron main process can reuse them.
10. Bridge modules MUST NOT import React, Zustand stores, route components, or client-only code.
11. Bridge modules MAY import pure workspace/domain helpers and server-only AI OS helpers.
12. `runAiCommand` MAY route to the bridge when the active provider is `claude-code-local` or `codex-local` and local runtime is allowed.
13. Without a usable local provider, `runAiCommand` MUST keep the deterministic fallback path.
14. The first bridge implementation MUST be non-streaming.
15. Streaming MAY be added only after non-streaming execution, cancellation, timeout, redaction, and proposal validation are covered by tests.
16. The bridge MUST keep local provider output in chat when it does not contain reviewable operations.
17. The bridge MUST queue proposals only when they contain valid `AiPatchProposal.operations`.
18. AI proposals MUST NOT apply automatically.
19. Applying a proposal MUST remain a separate user action through Rozetta's existing review flow.
20. Local providers MUST receive only the context selected by the user in `/ai`.
21. Workspace context sent to a local provider MUST label token data, Figma data, Git diffs, attachments, and user text as untrusted data.
22. Local providers MUST be instructed that only Rozetta-owned tools can apply changes.
23. The bridge MUST validate agent output before turning it into a proposal.
24. Invalid structured output MUST become a chat response or safe error, not a patch queue item.
25. Proposal validation MUST run against the current workspace draft, not stale model assumptions.

## Provider behavior
1. `claude-code-local` MUST require an installed `claude` command or a user-approved absolute executable path.
2. `claude-code-local` MUST require an already-authenticated Claude Code session outside Rozetta.
3. `claude-code-local` MUST NOT ask for Claude.ai credentials, Claude Max credentials, Claude Code OAuth tokens, or Anthropic API keys.
4. `codex-local` MUST require an installed `codex` command or a user-approved absolute executable path.
5. `codex-local` MUST require an already-authenticated Codex session outside Rozetta.
6. `codex-local` MUST NOT ask for ChatGPT credentials, Codex OAuth tokens, or OpenAI API keys.
7. Provider readiness MUST distinguish unavailable, installed-but-unauthenticated, ready, timed-out, misconfigured, and failed.
8. Provider readiness checks MUST be bounded by short timeouts.
9. Provider readiness checks MUST capture limited output.
10. Provider readiness checks MUST redact output before exposing it to UI.
11. Provider readiness checks MUST NOT print secrets, full environments, full home paths, or session tokens.
12. Provider adapters MUST expose a shared interface so Electron can later call the same adapters from its main process.

## Data
- Planned provider ids: `claude-code-local`, `codex-local`.
- Planned provider kind shape: either extend `AiProviderKind` or add a separate `AiRuntimeKind`; this decision MUST be made before implementation and recorded in [contracts §1.8](../contracts.md#18-ai-os-actions).
- `AiProviderConfig` MAY gain local runtime fields such as:
  - `executablePath?: string`
  - `timeoutMs?: number`
  - `readiness?: AiLocalProviderReadiness`
  - `localOnly?: boolean`
- Local provider config MUST NOT store account passwords, OAuth tokens, session tokens, API keys, shell profiles, or raw provider CLI output.
- Non-secret local provider preferences MAY be stored in `.rozetta/ai-settings.local.json`.
- Provider secrets MUST NOT be stored in the Supabase/Postgres runtime DB.
- Provider secrets MUST NOT be stored in Git-versioned artifacts.
- Readiness state MAY be recomputed on demand instead of persisted.
- Chat history MUST continue to use `.rozetta/ai-conversations.json`.
- Patch proposals MUST continue to use `.rozetta/ai-patches.json`.
- Session summaries MUST continue to use `.rozetta/ai-sessions.json`.

## Server modules
The implementation SHOULD use small server-only modules with separate responsibilities:

- *src/lib/ai-os/local-agent/runtime.ts*: hosted/local runtime detection.
- *src/lib/ai-os/local-agent/types.ts*: local provider runtime types.
- *src/lib/ai-os/local-agent/redaction.ts*: secret redaction and output truncation.
- *src/lib/ai-os/local-agent/process.ts*: safe process execution wrapper.
- *src/lib/ai-os/local-agent/claude-code.ts*: Claude Code readiness and execution adapter.
- *src/lib/ai-os/local-agent/codex.ts*: Codex readiness and execution adapter.
- *src/lib/ai-os/local-agent/prompt.ts*: local-provider prompt assembly.
- *src/lib/ai-os/local-agent/proposal.ts*: conversion from agent output to Rozetta proposal/chat result.
- *src/lib/ai-os/local-agent/index.ts*: small public server-only entrypoint.

These module names are a target shape, not a public API. If implementation picks different names, this spec and [architecture](../architecture.md) MUST be updated.

## Process execution
1. The bridge MUST use `spawn` or provider SDK APIs, not interpolated shell commands.
2. The bridge MUST NOT use `shell: true`.
3. The bridge MUST pass arguments as arrays.
4. The bridge MUST execute only allowlisted provider binaries or user-approved absolute executable paths.
5. User-approved executable paths MUST be normalized and stored as non-secret local settings.
6. The bridge MUST NOT recursively scan the filesystem to find executables.
7. The bridge SHOULD search only common install paths and the current process `PATH`.
8. The bridge MUST set a timeout for every readiness check and agent turn.
9. The bridge MUST terminate child processes on timeout, cancellation, server shutdown, or request abort.
10. The bridge MUST limit stdout and stderr bytes captured from child processes.
11. The bridge MUST redact stdout and stderr before returning diagnostics or persisting logs.
12. The bridge MUST pass a minimal environment to child processes.
13. The bridge MUST NOT pass the entire `process.env` by default.
14. Minimal environment MAY include `PATH`, `HOME`, `SHELL`, `TMPDIR`, locale values, and provider-required variables only when needed.
15. The bridge MUST NOT expose raw environment values to the model or UI.
16. The bridge MUST use the active workspace root as `cwd` only when needed for provider context.
17. If a provider does not need direct workspace file access, the bridge SHOULD use a safer temporary working directory.
18. The bridge MUST NOT grant package manager, arbitrary script, broad Git write, or filesystem mutation abilities in v1.

## Filesystem controls
1. The bridge MUST preserve original token immutability from [constitution §2](../constitution.md#2-originals-are-immutable).
2. The bridge MUST NOT write token/theme/design-system artifacts directly.
3. The bridge MUST NOT write outside `.rozetta/ai-*` AI persistence unless an existing Rozetta Server Action already owns that write.
4. Any workspace path included in prompts MUST come from Rozetta-owned workspace loaders.
5. Any user-configured executable path MUST be absolute or resolved safely before execution.
6. Symlink targets MUST NOT be trusted for future write operations.
7. The bridge MUST NOT read arbitrary files requested by model output.
8. Attachments MUST follow existing attachment preview limits and MUST be treated as untrusted prompt context.

## Prompt and output controls
1. Prompt assembly MUST include a stable system instruction for local providers.
2. The system instruction MUST say that model output does not apply changes.
3. The system instruction MUST ask for concise, reviewable output.
4. Structured proposal output MUST be optional; explanatory responses are valid chat-only results.
5. If structured proposals are requested, the expected schema MUST be documented in the prompt and validated in code.
6. The bridge MUST reject unknown operation types.
7. The bridge MUST reject unknown Collection ids, token paths, theme ids, brand ids, component ids, export profile ids, and draft ids.
8. The bridge MUST preserve `$extensions` by routing accepted token edits through existing serializer/apply flows.
9. The bridge MUST include the provider id and model/runtime id in `AiPatchProposal.source`.
10. The bridge MUST identify local-provider proposals clearly in chat metadata.

## UI
- Route: `/settings`, AI Providers tab.
- Route: `/ai`, AI Assistant Home.
- Component: *src/components/settings/studio-settings.tsx*.
- Component: *src/components/ai/ai-assistant-home.tsx*.
- Component: *src/components/ai/ai-review-queue.tsx*.

UI requirements:
1. Settings MUST show local providers separately from API-key providers.
2. Settings MUST show that `claude-code-local` and `codex-local` are local-only.
3. Settings MUST show readiness status and safe diagnostics.
4. Settings MUST include a "test connection" action before users run a chat turn.
5. Settings MUST NOT show raw command stdout/stderr.
6. Settings MUST NOT show raw environment variables.
7. `/ai` MUST show when the active provider is local-only.
8. `/ai` MUST show a safe error if local execution is disabled in the current runtime.
9. Hosted/Vercel UI MUST hide local providers or mark them unavailable with clear copy.

## Runtime guard
The local runtime guard MUST deny execution when any of these are true:

- `process.env.VERCEL` is set.
- `process.env.NEXT_RUNTIME === "edge"`.
- A future Rozetta hosted flag is set.
- The runtime cannot access Node child process APIs.
- The request is not handled by server-only code.

The guard MAY allow execution when:

- Rozetta is running through `pnpm dev`.
- Rozetta is running through self-hosted `next start` on the user's machine.
- Rozetta is running through a future Electron main process that explicitly enables local providers.

## Testing
Unit tests MUST cover:
1. Runtime guard allows local Node runtime.
2. Runtime guard rejects Vercel/serverless indicators.
3. Runtime guard rejects Edge runtime.
4. Redaction removes API keys, bearer tokens, OAuth-like tokens, and common secret env names.
5. Output truncation caps stdout/stderr.
6. Process wrapper uses argument arrays and rejects `shell: true`.
7. Unknown executable names are rejected.
8. User-approved executable paths are normalized.
9. Readiness timeout returns timed-out status.
10. Provider failure returns safe diagnostics.
11. Invalid model proposal output is not queued.
12. Valid proposal output is queued only after schema validation.

Integration tests SHOULD cover:
1. `runAiCommand` uses deterministic fallback when local provider is unavailable.
2. `runAiCommand` rejects local provider execution in hosted runtime.
3. `runAiCommand` appends user and assistant messages even when local provider fails safely.
4. Proposal preview still validates against the current workspace.

Manual QA SHOULD cover:
1. `claude` installed and authenticated.
2. `claude` installed but unauthenticated.
3. `claude` missing.
4. `codex` installed and authenticated.
5. `codex` installed but unauthenticated.
6. `codex` missing.
7. Vercel-like env vars set locally.
8. Long-running provider turn cancellation.
9. Provider command timeout.

## Implementation plan
1. Add this feature spec and link it from the specs index.
2. Decide and document the local provider type shape before code changes.
3. Update [contracts §1.8](../contracts.md#18-ai-os-actions) if exported types or Server Action signatures change.
4. Add local runtime guard tests first.
5. Add redaction and output truncation tests.
6. Add safe process wrapper.
7. Add provider readiness adapters for `claude-code-local` and `codex-local`.
8. Add local provider config normalization/redaction.
9. Wire readiness into `/settings`.
10. Wire non-streaming local execution into `runAiCommand`.
11. Convert local provider output into chat-only responses first.
12. Add validated proposal conversion after chat-only output is stable.
13. Ensure hosted/Vercel builds hide or disable local providers.
14. Run `pnpm lint` and `pnpm exec tsc --noEmit`.
15. Update [Desktop Local AI](./desktop-local-ai.md) if implementation reveals changes to the Electron migration plan.

## Acceptance checks
1. `pnpm lint` passes.
2. `pnpm exec tsc --noEmit` passes.
3. Local providers are unavailable when `VERCEL` is set.
4. Local providers are unavailable in Edge runtime.
5. Browser components cannot import bridge modules.
6. Provider execution uses server-only code.
7. Provider execution never uses `shell: true`.
8. Provider execution rejects non-allowlisted commands.
9. Provider diagnostics are redacted and truncated.
10. No provider secret is stored in Git artifacts or the Supabase/Postgres runtime DB.
11. `runAiCommand` falls back deterministically when a local provider is unavailable.
12. Local provider responses appear in chat.
13. Reviewable operations enter `.rozetta/ai-patches.json` only after validation.
14. Applying proposals remains explicit and reviewable.
15. No Electron code is required for this feature.

## Out of scope
- Electron packaging, signing, notarization, auto-update, IPC, preload, or desktop windows.
- Using Claude Max, Claude Pro, ChatGPT Plus/Pro, or Codex subscriptions as a hosted Rozetta SaaS backend.
- Asking for Claude.ai or ChatGPT passwords.
- Asking users to paste Claude Code or Codex session tokens.
- Automating Claude.ai, ChatGPT, or provider web UIs with cookies/session scraping.
- Arbitrary terminal execution from chat.
- Autonomous workspace mutation.
- Broad Git write workflows.
- Remote control of a user's local machine from Vercel-hosted Rozetta.

## Open questions
- Should local providers extend `AiProviderKind` or live under a separate `AiRuntimeKind`?
- Which provider should be implemented first: `claude-code-local` or `codex-local`?
- What exact readiness commands are safest for current Claude Code and Codex versions?
- Should local provider command paths be editable in v1, or should v1 rely only on auto-detection?
- Should the bridge ask local providers for structured JSON directly, or first capture natural-language output and derive proposals with Rozetta-owned deterministic logic?
