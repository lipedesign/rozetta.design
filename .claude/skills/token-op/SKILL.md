---
name: token-op
description: Reference for safe DTCG token-tree operations in Rozetta — always mutate via the serializer and traverse with type guards. Use when reading, editing, or generating code that creates, updates, moves, or deletes design tokens or groups.
---

# token-op — safe DTCG token-tree operations

Token trees are load-bearing. There is exactly one safe way to read and mutate them.

## Rules

1. **Mutate only via the serializer** (`@/lib/dtcg/serializer` or the project's serializer module):
   - `setTokenAtPath(set, path, token)` — set/replace a token at a path.
   - `insertTokenAtPath(set, path, token)` — insert a new token/group.
   - `deleteTokenAtPath(set, path)` — remove a token/group.
   - **Never** assign directly: `set.root[...] = ...` is forbidden — it bypasses validation/normalization and breaks invariants.
2. **Traverse with type guards**: `import { isDtcgToken, isDtcgGroup } from "@/lib/dtcg/types"`. Guard every node before treating it as a token vs. a group.
3. **Reconcile selection after structural change**: after delete/move, clear or remap `selectedToken` / `multiSelection` (domain invariant I6) so the UI never points at a missing path.
4. **Aliases**: resolve aliases through the resolver, not by string-munging the reference.

## Pattern

```ts
import { isDtcgToken } from "@/lib/dtcg/types";
import { setTokenAtPath, deleteTokenAtPath } from "@/lib/dtcg/serializer";

// edit
const next = setTokenAtPath(set, path, token);
// delete + reconcile selection
const pruned = deleteTokenAtPath(set, path);
clearSelectionIfMissing(pruned, selection);
```

Before writing new traversal/mutation code, search `src/lib/dtcg/**` for an existing helper that already does it. Confirm names against the current code — APIs evolve.
