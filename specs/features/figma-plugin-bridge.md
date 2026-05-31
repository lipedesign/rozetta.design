[//]: # (Feature spec: Rozetta Bridge plugin)

# Feature: Rozetta Bridge

## Status
partial

## Purpose
Provide the local Figma plugin that connects Figma Variables to Rozetta. The plugin is a focused operational bridge, not a second version of Rozetta.

It owns three jobs:

1. Pair the current Figma file with a Rozetta workspace.
2. Read Figma Variables and send reviewed snapshots to Rozetta.
3. Apply reviewed Rozetta writeback payloads back into Figma Variables.

The plugin UI MUST look like a compact extension of Rozetta using the product's `base-luma` visual language.

## Product stance
- Figma is one connector in Sync Hub, not the center of Rozetta.
- The plugin writes to Figma because the Figma Plugin API is the safest v1 write channel.
- Rozetta remains the review surface. The plugin performs execution after the user confirms.
- No Figma Enterprise API is required in v1.

## Stack
1. The v1 plugin uses the existing lightweight Figma plugin structure:
   - `figma-plugin/manifest.json`
   - `figma-plugin/code.js`
   - `figma-plugin/ui.html`
2. No paid UI kit or generic visual framework is allowed.
3. The plugin UI MAY later migrate to Plugma, React, Preact, or a TypeScript build if the manual HTML/JS surface grows too large.
4. Until that migration happens, the no-build plugin MUST keep UI and runtime code small enough to review directly.
5. Runtime code MUST only use the Figma Plugin API, browser APIs available inside plugin UI, and Rozetta's documented local HTTP endpoints.

## Mini Design System
The plugin has its own small UI kit inspired by `base-luma`.

### Primitives
- Buttons: primary, secondary, ghost, danger.
- Inputs: text, textarea, compact URL/code fields.
- Badges: neutral, success, warning, danger.
- Tabs/segmented controls for Pair, Import, Writeback.
- Compact rows for collections, variables, operations, and status details.
- Empty states with small icon, title, and single action.
- Progress/status indicators for reading, sending, applying, and errors.

### Visual rules
1. Use neutral surfaces, subtle borders, and compact spacing.
2. Avoid large decorative cards, marketing hero composition, and illustration.
3. Primary actions use dark foreground on light mode and Figma theme variables where possible.
4. The plugin MUST stay readable inside a narrow panel around 360-420px wide.
5. Text sizes should be compact: 11-14px.
6. Icons MAY be inline SVGs or lucide-derived paths when bundle size allows.

## Pair Workspace
1. Rozetta generates or displays a temporary pairing code for the active workspace.
2. The user pastes the code into the plugin.
3. The plugin stores only non-secret local pairing metadata:
   - Rozetta local URL, default `http://localhost:3001`
   - pairing code
   - last connected workspace label if provided by Rozetta
4. The plugin includes the pairing code in requests to Rozetta.
5. Rozetta validates the signed temporary code and maps the request to the active workspace.
6. Pairing MUST expire and MUST NOT grant broad account access.
7. Pairing codes expire and are scoped to the active `WorkspaceContext`.
8. The plugin MUST NOT send snapshots without a pairing code once Auth is active.
9. Per-code revocation is planned for a server-side pairing registry; v1 revocation is secret rotation plus short TTL.

## Import: Figma to Rozetta
1. Plugin reads local variable collections with `figma.variables.getLocalVariableCollectionsAsync()`.
2. Plugin reads local variables with `figma.variables.getLocalVariablesAsync()`.
3. Plugin serializes:
   - file key/name/url
   - collections
   - modes
   - variable ids/keys/names/types
   - values by mode
   - aliases
   - descriptions
   - scopes
   - code syntax
4. Plugin sends `FigmaFileSnapshot` to `POST /api/figma/snapshot`.
5. Rozetta stores snapshots in Supabase/Postgres and shows diff/review in `/sync/figma`.
6. Rozetta maps each Figma Collection to one Rozetta Collection and each Figma Mode to a mode inside it. A round-trip snapshot from the same file MUST NOT create false Collection removals or token removals.
7. Applying the imported snapshot to Rozetta remains explicit inside Rozetta.
8. The Rozetta review UI presents this direction as **Pull Figma → Rozetta** so the user understands the plugin snapshot is the source.

## Writeback: Rozetta to Figma
1. Rozetta generates `rozetta-figma-writeback/v1` payloads from reviewed workspace state.
2. Rozetta generates payloads from the live workspace database, not from stale client state.
3. The plugin accepts a payload from Rozetta UI or pasted JSON in the plugin.
4. The plugin previews operation counts before applying.
5. Applying writeback requires explicit user confirmation in the plugin.
6. The plugin upserts Variables and mode values through the Figma Plugin API.
7. The plugin MUST read tokens from the bound `CollectionMode` root (`modeRoots[rozettaModeId]`) before falling back to the collection default root.
8. The plugin MUST convert Rozetta DTCG color objects (`colorSpace`, `components`, `alpha`, `hex`) back to Figma RGBA values.
9. Destructive deletes are blocked in v1 even when a payload mentions them.
10. Results are reported as `created`, `updated`, `skipped`, and `failed`.
11. The Rozetta review UI presents this direction as **Push Rozetta → Figma** so users distinguish it from incoming snapshots.

## Live sync
While the plugin UI is open and the pairing is valid, the plugin operates as a continuous bridge so changes flow in both directions without manual snapshot/paste steps. Apply remains a discrete user action in both directions — live sync auto-detects and auto-previews, never auto-applies.

1. The plugin UI MUST expose a `Live sync` toggle. After a successful pairing the toggle defaults to ON and is persisted via `figma.clientStorage`.
2. While Live sync is ON, the plugin MUST subscribe to `figma.on('documentchange', ...)` and react only to changes whose `documentChange` entries reference `Variable`, `VariableCollection`, or `VariableMode` ids.
3. The plugin MUST debounce documentchange-driven snapshot pushes by 500 ms (coalescing rapid edits into a single snapshot).
4. The plugin MUST poll `GET /api/figma/writeback/pending?seq=<lastAckSeq>` every 3 seconds while Live sync is ON. It MUST stop polling immediately when paused, unpaired, or when the pairing endpoint returns 401 (pairing expired).
5. When the polling response carries `hasPending: true`, the plugin MUST render the writeback payload in a "Pending from Rozetta" panel and require an explicit `Apply` click before calling the Figma Plugin API.
6. After applying its own writeback the plugin MUST mute its `documentchange` subscription for 2 seconds, suppressing the echo events that the apply itself emits. The mute window MUST be reset every time apply runs.
7. The plugin MUST POST `/api/figma/writeback/result` with the per-operation outcomes and the `ackSeq` it received, even on full failure. Cancellation MUST be reported as `skipped` on every operation.
8. The plugin UI MUST surface a single status indicator with the states `paused`, `watching`, `pushing`, `receiving`, `applying`, `error`.
9. The manual `Send snapshot` and pasted-JSON writeback flows MUST remain available as fallbacks; Live sync does not replace them.

## Security
1. Plugin never stores Supabase service keys, DB passwords, GitHub tokens, or AI keys.
2. Plugin never accepts arbitrary code, shell commands, or user prompt text as an operation.
3. Plugin only calls configured Rozetta local endpoints.
4. Plugin must not auto-apply writeback payloads on load.
5. Plugin writeback must validate payload `version`.
6. Cross-workspace writes require a valid pairing code.

## Implementation phases
1. **No-build foundation**: base-luma UI, local URL/code pairing fields, snapshot send, pasted writeback apply.
2. **Server pairing**: Rozetta pairing code generation/validation and workspace binding.
3. **Writeback transport**: Rozetta sends reviewed payloads to the plugin without copy/paste.
4. **Optional build migration**: move UI to Plugma/React/Preact if the plugin becomes complex enough.

## Test Plan
- Import plugin from manifest in Figma Desktop.
- Pair with local Rozetta URL/code.
- Read variables from a test Figma file.
- Send snapshot and confirm it appears in `/sync/figma`.
- Paste a `rozetta-figma-writeback/v1` payload.
- Preview operation counts.
- Apply to a disposable Figma Variables test file.
- Confirm created/updated/skipped/failed counts are visible.
- Confirm no destructive deletes occur.

## Out of scope
- Full token editing inside the plugin.
- User/member management inside the plugin.
- AI chat inside the plugin.
- Marketplace-grade packaging.
- Figma Enterprise API integration.
