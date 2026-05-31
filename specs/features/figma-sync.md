# Feature: Figma Sync

## Status
implemented

## Purpose
Exchange reviewed Variables snapshots and DTCG payloads between Rozetta and a local Figma plugin without relying on Figma Enterprise APIs.

## Behavior
1. The sidebar MUST NOT expose Figma Sync as a separate top-level item.
1.1. The sidebar's **Sync Hub** item MUST navigate to `/sync`, where Figma is represented as one active connector.
1.2. The Figma connector CTA MUST navigate to `/sync/figma`.
2. The local plugin is **Rozetta Bridge** (see [`figma-plugin-bridge.md`](./figma-plugin-bridge.md)).
2.1. The plugin UI MUST follow the compact `base-luma` visual language and MUST remain an operational bridge, not a full Studio UI.
2.2. Pairing uses a Rozetta URL and signed temporary workspace code so snapshots are scoped to the intended workspace.
3. The local plugin reads Collections, Modes, Variables, aliases, and code syntax into `FigmaFileSnapshot`.
3.1. `figmaSnapshotToRozetta` MUST preserve the Figma model: every Figma Collection becomes one Rozetta `TokenCollection`, and every Figma Mode becomes a `CollectionMode` inside that Collection.
3.2. Groups are derived from token paths only, for example `color / surface / neutral`; they are not persisted as first-class sync entities.
3.3. Semantic diffs MUST treat Figma alias metadata and canonical DTCG alias values that point to the same token path as equivalent.
3.4. Figma color values MUST round-trip into the same DTCG color object shape used by Rozetta token artifacts (`colorSpace`, `components`, `alpha`, `hex`) to avoid false diffs.
4. The plugin MAY POST snapshots to `/api/figma/snapshot` with `X-Rozetta-Workspace-Code`; users MAY also paste/upload snapshot JSON manually.
5. Rozetta stores snapshots, bindings, sync runs, and PR drafts in Supabase/Postgres.
6. Import accepts pasted/uploaded snapshots or legacy `rozetta-figma-sync/v1` payloads, validates JSON shape, and shows a semantic diff.
7. Applying an imported payload requires an explicit user action after review.
8. Applying replaces matching Collection ids/mode ids, imports new Collections/Modes, and upserts themes in the DB-first workspace. Those changes remain dirty relative to Git artifacts until the normal Save flow exports them.
9. Export/writeback creates a `rozetta-figma-writeback/v1` payload with Collections, Modes, Themes, bindings, and safety metadata for plugin review.
9.0. Writeback payloads MUST be generated from the live Supabase/Postgres workspace state by `prepareFigmaPayload`, not from client-side store snapshots.
9.1. End-to-end writeback (plugin apply, optional `figma-cli` adapter, proposal-review flow, runtime guard) is specified in [Figma Writeback Bridge](./figma-writeback.md). This `figma-sync.md` covers the snapshot ingestion direction only; writeback execution lives in that spec.
9.2. Receiving an auto-snapshot via `/api/figma/snapshot` MUST automatically generate the preview `SyncRun` (`direction: figma-to-rozetta`, `status: draft`) so `/sync/figma` shows it as ready for review without the user having to click "Review latest snapshot". Preview generation MUST NOT mutate the DB beyond persisting the snapshot itself and the draft `SyncRun`.
9.3. The persistent `(studio)` shell MUST mount a global `FigmaIncomingSheet` that polls `getLatestFigmaIncoming()` on a short interval and surfaces the latest `figma-to-rozetta` `status: draft` SyncRun as a side sheet from any authenticated route. The sheet MUST require an explicit "Apply to Rozetta" click before mutating workspace tokens/themes; "Dismiss" MUST mark the SyncRun as `failed` with a dismissed-by-user summary so the same draft never re-pops. Dismissed sync run ids MAY be remembered locally via `localStorage` to avoid race conditions between the poll and a fresh dismissal.
10. Removals/destructive changes MUST remain reviewable and MUST NOT apply automatically.
11. No Figma Enterprise API, cloud sync, brand/component registry sync, or automatic destructive replace is used in v1.
12. Figma MUST NOT be treated as the only design-tool integration model; future adapters use the Connector Hub contract.
13. `/figma-sync` MUST redirect to `/sync/figma` for compatibility with older links.

## Data
- Types: `FigmaSyncPayload`, `FigmaCollectionMapping`, `FigmaModeMapping`, `SyncDiff`, `FigmaFileSnapshot`, `FigmaBridgeState`, `FigmaVariableBinding`, `SyncRun`, `SyncOperation`.
- Pure helpers: `createFigmaSyncPayload`, `parseFigmaSyncPayload`, `buildSyncDiff`.
- Figma bridge helpers: `figmaSnapshotToRozetta`, `buildFigmaToRozettaSyncRun`, `createRozettaToFigmaPayload`.
- Pairing helpers: `createFigmaBridgePairingCode`, `resolveFigmaBridgePairingCode`.
- Server Actions: `receiveFigmaSnapshot`, `getFigmaSyncState`, `previewFigmaToRozetta`, `applyFigmaSnapshotToRozettaDraft`, `prepareFigmaPayload`.
- Route Handler: `POST /api/figma/snapshot`, accepting optional `X-Rozetta-Workspace-Code` for plugin requests.
- Plugin: `figma-plugin/` implementing [`Rozetta Bridge`](./figma-plugin-bridge.md).

## UI
- Route: `/sync/figma`.
- Compatibility route: `/figma-sync` redirects to `/sync/figma`.
- Component: *src/components/figma-sync/figma-sync-page.tsx*.
- Shell: *src/components/product-shell.tsx*.
- The sync UI labels the two directions as **Pull Figma → Rozetta** and **Push Rozetta → Figma**.

## Collection / Mode mapping
- Figma Collection `Primitives` maps to Rozetta Collection `primitives`.
- Figma Mode `Default` maps to mode `default` within `primitives`.
- Figma Collection `Semantic` maps to Rozetta Collection `semantic`.
- Figma Mode `Consumer` maps to mode `consumer` within `semantic`.
- A variable named `color/surface/neutral/default` becomes token path `color.surface.neutral.default` under the active Collection/Mode root.
