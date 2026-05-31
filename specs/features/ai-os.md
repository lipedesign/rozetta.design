# Feature: AI OS

## Status
implemented

## Purpose
Make AI the primary operating surface for Rozetta while keeping all mutations explicit, reviewable, local-first, and provider-agnostic.

## User stories
- As a design system maintainer, I can ask Rozetta to inspect the workspace and propose safe patches.
- As a white-label product owner, I can configure my own OpenAI or Anthropic key locally.
- As an AI agent, I can call deterministic MCP tools that expose context and proposals without writing files.

## Behavior
1. `/ai` MUST render the AI Assistant Home.
2. The Assistant MUST let the user choose an intent shortcut, enter a prompt, and adjust context areas.
3. `/settings` MUST expose Studio Settings with AI provider/model/API key configuration.
4. If no configured provider key is available, Rozetta MUST use the deterministic fallback.
5. Provider keys MUST be stored only in `.rozetta/ai-settings.local.json`.
6. `.rozetta/ai-settings.local.json` MUST be ignored by Git.
7. AI proposals MUST be stored in `.rozetta/ai-patches.json`.
8. AI task history MUST be summarized in `.rozetta/ai-sessions.json`.
9. AI chat conversation history MUST be stored in `.rozetta/ai-conversations.json`.
10. The v1 AI chat is persisted but not streamed.
11. Responses without reviewable operations MUST remain in the chat and MUST NOT enter the review queue.
12. AI MUST NOT mutate tokens, themes, brands, components, release notes, or export profiles automatically.
13. Applying a proposal MUST require explicit user action.
14. Applying a proposal MUST validate the patch before applying it to the current workspace draft.
15. Supported patch operations are defined by `AiPatchOperationSchema` (Zod discriminated union) in *src/lib/ai-os/contract/operation-schema.ts*. See [`ai-data-contract.md`](./ai-data-contract.md).
16. The AI Assistant hides Brands from visible context controls while Brands is paused.
17. `/ai` SHOULD receive operational context from the runtime database, including DB-first tokens/themes, recent Figma snapshots, bindings, sync runs, and GitHub PR drafts.
18. AI MAY explain Figma/Rozetta/Git divergence and prepare reviewable PR notes, but MUST NOT publish or mutate without explicit user action.
19. The AI receives a budgeted, deterministic context snapshot built by `buildAiContextGraph` and serialized via `serializeContextForPrompt`. For richer context, AI MAY call read-only retrieval tools (`rozetta_search_tokens`, `rozetta_get_token`, `rozetta_recent_changes`). See [`ai-data-contract.md`](./ai-data-contract.md).

## Data
- `AiProviderConfig`, `AiProviderKind`, `AiModelConfig`
- `AiCommandSession`, `AiTaskContext`, `AiTaskKind`
- `AiConversation`, `AiConversationMessage`, `AiMessageRole`, `AiMessageStatus`
- `AiPatchProposal`, `AiPatchOperation`, `AiPatchStatus`
- `AiReviewResult`, `AiApplyResult`
- `OperationalContext` with Figma bridge state, sync runs, and GitHub PR drafts

## Providers
Supported `AiProviderKind` values:
- `deterministic` — built-in fallback; always available.
- `openai` — OpenAI API via Vercel AI SDK; requires a user-supplied API key.
- `anthropic` — Anthropic API via Vercel AI SDK; requires a user-supplied API key.
- `claude-code-local` — Claude Code (local). Runs the `claude` CLI via `execFile` from server-only adapters under *src/lib/ai-os/local-agent/*. Local runtime only — disabled in Vercel/Edge. Requires the user to have `claude` installed and authenticated outside Rozetta. See [Local Agent Bridge](./local-agent-bridge.md).
- `codex-local` — Codex (local). Runs the `codex` CLI via `execFile` from the same server-only adapters. Local runtime only — disabled in Vercel/Edge. Requires the user to have `codex` installed and authenticated outside Rozetta. See [Local Agent Bridge](./local-agent-bridge.md).

## UI
- Route: `/ai`
- Component: *src/components/ai/ai-assistant-home.tsx*
- Settings route: `/settings`
- Settings component: *src/components/settings/studio-settings.tsx*
- The existing AI Panel remains a quick entry and links to the AI Assistant.

## Out of scope
- Cloud billing.
- Team accounts.
- Autonomous background mutation.
- Using NanoClaw as a required runtime dependency.

## Open questions
- Whether a future Rozetta hosted provider should become the default after BYOK.
