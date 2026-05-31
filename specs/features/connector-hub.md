# Feature: Connector Hub

## Status
implemented

## Purpose
Make Rozetta sync agnostic: Figma is an important connector, not the conceptual center of the product.

## User stories
- As a maintainer, I can see which sync connectors are active or planned.
- As an agent, I can discover connector readiness through MCP without depending on a UI route.
- As a future integration author, I can target a stable connector contract.

## Behavior
1. `/sync` MUST render the Connector Hub.
2. Figma MUST appear as an active connector and link to `/sync/figma`.
3. DTCG file MUST appear as an active connector and link to export/file workflows.
4. Code and Generic Design Tool connectors MUST appear as planned connectors.
5. Connector capabilities MUST be represented as structured data, not hard-coded only in JSX.
6. `/figma-sync` MUST remain available as a redirect to `/sync/figma` for compatibility.
7. Figma Sync MUST NOT appear as a separate top-level sidebar item.

## Data
- `SyncConnector`
- `SyncConnectorKind`
- `SyncCapability`
- `SyncReadiness`

## UI
- Route: `/sync`
- Component: *src/components/sync/sync-hub-page.tsx*
- Sidebar item: **Sync Hub**

## Out of scope
- Replacing the existing Figma file/plugin payload workflow.
- Enterprise Figma API.
- Codegen or source-code writes.

## Open questions
- Which non-Figma design tool should be the first real adapter after Figma.
