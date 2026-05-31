/**
 * DTCG parser.
 *
 * Walks a DTCG group tree and produces flat token / group lists. Group-level
 * `$type` is propagated downward so that tokens that omit `$type` (legal in
 * DTCG when an ancestor declares it) still carry the right type.
 */

import {
  isDtcgGroup,
  isDtcgToken,
  type DtcgGroup,
  type DtcgToken,
  type DtcgType,
  type FlatGroup,
  type FlatToken,
  type TokenSet,
} from "./types";

const isMetaKey = (key: string) => key.startsWith("$");

/** Returns true when the alias is a literal alias `{path.to.token}`. */
export function isAliasValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.startsWith("{") &&
    value.endsWith("}")
  );
}

/** Extracts the alias path inside braces. `"{a.b.c}" -> "a.b.c"`. */
export function aliasPath(value: string): string {
  return value.slice(1, -1);
}

/** Walks the tree and yields every token with its full dot path. */
export function* walkTokens(
  root: DtcgGroup,
  parentPath = "",
  inheritedType?: DtcgType
): Generator<{ path: string; token: DtcgToken; resolvedType: DtcgType }> {
  const groupType = (root.$type as DtcgType | undefined) ?? inheritedType;

  for (const [key, child] of Object.entries(root)) {
    if (isMetaKey(key)) continue;

    const childPath = parentPath ? `${parentPath}.${key}` : key;

    if (isDtcgToken(child)) {
      const resolvedType = (child.$type as DtcgType | undefined) ?? groupType;
      if (!resolvedType) {
        continue;
      }
      yield { path: childPath, token: child, resolvedType };
    } else if (isDtcgGroup(child)) {
      yield* walkTokens(child, childPath, groupType);
    }
  }
}

/** Walks the tree and yields every group node with its full dot path. */
export function* walkGroups(
  root: DtcgGroup,
  parentPath = "",
  inheritedType?: DtcgType
): Generator<{ path: string; group: DtcgGroup; resolvedType?: DtcgType }> {
  const groupType = (root.$type as DtcgType | undefined) ?? inheritedType;

  yield { path: parentPath, group: root, resolvedType: groupType };

  for (const [key, child] of Object.entries(root)) {
    if (isMetaKey(key)) continue;
    if (isDtcgToken(child)) continue;
    if (isDtcgGroup(child)) {
      const childPath = parentPath ? `${parentPath}.${key}` : key;
      yield* walkGroups(child, childPath, groupType);
    }
  }
}

/** Builds the flat token list for a single token set. */
export function flattenTokens(set: TokenSet): FlatToken[] {
  const flat: FlatToken[] = [];
  for (const { path, token, resolvedType } of walkTokens(set.root)) {
    const segments = path.split(".");
    flat.push({
      collectionId: set.id,
      setId: set.id,
      modeId: set.activeModeId,
      path,
      name: segments[segments.length - 1] ?? path,
      $type: resolvedType,
      $value: token.$value,
      $description: token.$description,
      $extensions: token.$extensions,
      isAlias: isAliasValue(token.$value),
    });
  }
  return flat;
}

/** Builds the flat group list, including a count of descendant tokens. */
export function flattenGroups(set: TokenSet): FlatGroup[] {
  const tokenPaths = flattenTokens(set).map((t) => t.path);
  const groups: FlatGroup[] = [];

  for (const { path, group, resolvedType } of walkGroups(set.root)) {
    const tokenCount = tokenPaths.filter((p) =>
      path === "" ? true : p === path || p.startsWith(`${path}.`)
    ).length;

    const segments = path.split(".");
    groups.push({
      collectionId: set.id,
      setId: set.id,
      modeId: set.activeModeId,
      path,
      name: path === "" ? set.name : (segments[segments.length - 1] ?? path),
      $type: resolvedType,
      $description: group.$description,
      tokenCount,
    });
  }
  return groups;
}

/**
 * Returns the immediate child entries (groups + tokens) below a group path.
 * Used by the sidebar tree to render one level at a time.
 */
export function listChildren(
  set: TokenSet,
  groupPath: string
): Array<
  | { kind: "group"; path: string; name: string; tokenCount: number; $type?: DtcgType }
  | { kind: "token"; path: string; name: string; $type: DtcgType; $value: unknown; isAlias: boolean }
> {
  const node = getNodeAtPath(set.root, groupPath);
  if (!node || !isDtcgGroup(node)) return [];

  const groupType = node.$type as DtcgType | undefined;
  const children: ReturnType<typeof listChildren> = [];

  for (const [key, child] of Object.entries(node)) {
    if (isMetaKey(key)) continue;
    const childPath = groupPath ? `${groupPath}.${key}` : key;

    if (isDtcgToken(child)) {
      const resolvedType = (child.$type as DtcgType | undefined) ?? groupType;
      if (!resolvedType) continue;
      children.push({
        kind: "token",
        path: childPath,
        name: key,
        $type: resolvedType,
        $value: child.$value,
        isAlias: isAliasValue(child.$value),
      });
    } else if (isDtcgGroup(child)) {
      const subTokens = [...walkTokens(child, childPath, groupType)];
      children.push({
        kind: "group",
        path: childPath,
        name: key,
        tokenCount: subTokens.length,
        $type: (child.$type as DtcgType | undefined) ?? groupType,
      });
    }
  }

  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return children;
}

/** Returns the node (group or token) at a given dot-path, or undefined. */
export function getNodeAtPath(
  root: DtcgGroup,
  path: string
): DtcgGroup | DtcgToken | undefined {
  if (path === "") return root;

  const segments = path.split(".");
  let cursor: unknown = root;

  for (const segment of segments) {
    if (!isDtcgGroup(cursor) && !isDtcgToken(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (!cursor || (typeof cursor !== "object")) return undefined;
  return cursor as DtcgGroup | DtcgToken;
}
