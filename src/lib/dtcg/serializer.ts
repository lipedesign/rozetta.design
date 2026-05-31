/**
 * DTCG serializer.
 *
 * Writes a DTCG tree back to JSON. Two helpers:
 * - `serializeTokenSet` produces the canonical `JSON.stringify` output.
 * - `setTokenAtPath` returns a new tree with one token mutated, while
 *   preserving `$extensions` and any other unknown metadata. This is what the
 *   editor uses to apply edits before saving.
 */

import {
  isDtcgGroup,
  isDtcgToken,
  type DtcgGroup,
  type DtcgToken,
  type DtcgValue,
  type TokenSet,
} from "./types";

/** Returns the JSON string representation of a token set. */
export function serializeTokenSet(set: TokenSet, pretty = true): string {
  return JSON.stringify(set.root, null, pretty ? 2 : 0);
}

/**
 * Returns a deep clone of the input. Used before mutating to keep referential
 * isolation between the store and the on-disk representation.
 */
export function cloneGroup(group: DtcgGroup): DtcgGroup {
  return JSON.parse(JSON.stringify(group)) as DtcgGroup;
}

type TokenPatch = Partial<Pick<DtcgToken, "$value" | "$description" | "$type" | "$extensions">>;

/**
 * Returns a new tree where the token at `path` has been patched. Throws if
 * the path does not exist or does not point at a token.
 *
 * `$extensions` is merged shallowly so editor edits never wipe Figma metadata
 * (variableId, scopes, codeSyntax, aliasData).
 */
export function setTokenAtPath(
  root: DtcgGroup,
  path: string,
  patch: TokenPatch
): DtcgGroup {
  if (!path) throw new Error("Cannot patch the root node as a token.");

  const next = cloneGroup(root);
  const segments = path.split(".");
  let cursor: DtcgGroup | DtcgToken = next;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const child: unknown = (cursor as Record<string, unknown>)[segment];
    if (!child || (!isDtcgGroup(child) && !isDtcgToken(child))) {
      throw new Error(`Path "${path}" not found at segment "${segment}".`);
    }
    cursor = child;
  }

  const last = segments[segments.length - 1]!;
  const target: unknown = (cursor as Record<string, unknown>)[last];
  if (!isDtcgToken(target)) {
    throw new Error(`Path "${path}" does not point to a token.`);
  }

  const merged: DtcgToken = {
    ...target,
    ...(patch.$value !== undefined ? { $value: patch.$value as DtcgValue } : {}),
    ...(patch.$description !== undefined ? { $description: patch.$description } : {}),
    ...(patch.$type !== undefined ? { $type: patch.$type } : {}),
    $extensions: patch.$extensions
      ? { ...(target.$extensions ?? {}), ...patch.$extensions }
      : target.$extensions,
  };

  (cursor as Record<string, unknown>)[last] = merged;
  return next;
}

/**
 * Returns a new tree with `token` inserted at `path`, creating any missing
 * intermediate groups along the way. Throws when an existing entry at `path`
 * is encountered (the caller is responsible for pre-checking collisions) or
 * when an ancestor path is itself a token (writing token children inside a
 * leaf is not legal DTCG).
 *
 * Used by the editor's "rename / move" flow, which is logically a delete-old +
 * insert-new pair.
 */
export function insertTokenAtPath(
  root: DtcgGroup,
  path: string,
  token: DtcgToken
): DtcgGroup {
  if (!path) throw new Error("Cannot insert at the root path.");

  const next = cloneGroup(root);
  const segments = path.split(".");
  let cursor: DtcgGroup | DtcgToken = next;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const child: unknown = (cursor as Record<string, unknown>)[segment];
    if (child === undefined) {
      const created: DtcgGroup = {} as DtcgGroup;
      (cursor as Record<string, unknown>)[segment] = created;
      cursor = created;
      continue;
    }
    if (!isDtcgGroup(child) && !isDtcgToken(child)) {
      throw new Error(`Path "${path}" hits non-group at "${segment}".`);
    }
    if (isDtcgToken(child)) {
      throw new Error(
        `Cannot create children under "${segments.slice(0, i + 1).join(".")}" — already a token.`
      );
    }
    cursor = child;
  }

  const last = segments[segments.length - 1]!;
  if ((cursor as Record<string, unknown>)[last] !== undefined) {
    throw new Error(`Path "${path}" already exists.`);
  }
  (cursor as Record<string, unknown>)[last] = token;
  return next;
}

/**
 * Returns a new tree with the token at `path` removed. Empty groups are kept
 * (the user might want to add tokens later); pruning empty groups is left to
 * an explicit cleanup action.
 */
export function deleteTokenAtPath(root: DtcgGroup, path: string): DtcgGroup {
  if (!path) throw new Error("Cannot delete the root node.");

  const next = cloneGroup(root);
  const segments = path.split(".");
  let cursor: DtcgGroup | DtcgToken = next;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const child: unknown = (cursor as Record<string, unknown>)[segment];
    if (!child || (!isDtcgGroup(child) && !isDtcgToken(child))) {
      return next;
    }
    cursor = child;
  }

  const last = segments[segments.length - 1]!;
  delete (cursor as Record<string, unknown>)[last];
  return next;
}
