# Rozetta Bridge

Local Figma plugin bridge for Rozetta.

The plugin is a compact bridge, not a second Studio UI. It uses a small base-luma-inspired interface to:

- pair the open Figma file with a Rozetta workspace;
- read Variables and send snapshots to Rozetta;
- apply reviewed `rozetta-figma-writeback/v1` payloads back into Figma Variables.

## Install locally

1. Open Rozetta at `http://localhost:3001/sync/figma`.
2. In Figma, import this folder from **Plugins > Development > Import plugin from manifest...**.
3. Open **Plugins > Development > Rozetta Bridge**.

## Pair

1. Keep the local URL as `http://localhost:3001`, or change it if Rozetta is running on another port.
2. Copy the temporary workspace pairing code from `/sync/figma`.
3. Click **Save pairing**.

The current v1 stores the local URL and code in plugin `localStorage`; it does not store Supabase keys, GitHub tokens, DB passwords, or AI keys.
Pairing codes are signed by Rozetta, scoped to the active workspace, and expire.

## Import Figma to Rozetta

1. Open the **Import** tab.
2. Click **Read Variables** to create a snapshot.
3. Click **Send snapshot** to POST to `/api/figma/snapshot` with the workspace code.
4. Review and apply the generated Rozetta draft in `/sync/figma`.

## Writeback Rozetta to Figma

1. In `/sync/figma`, use **Push Rozetta → Figma** to copy or download a `rozetta-figma-writeback/v1` payload generated from the live workspace database.
2. Open the **Writeback** tab.
3. Paste the payload and click **Preview payload**.
4. Click **Apply to Figma** only after reviewing the operation count.

Deletes are intentionally blocked in v1. Writeback reports created, updated, skipped, and failed operations. Collection modes are applied from `modeRoots`, so multi-mode Figma Variables can round-trip without flattening to the default mode.

Rozetta keeps runtime snapshots in Supabase/Postgres and keeps Git artifacts as JSON files.
