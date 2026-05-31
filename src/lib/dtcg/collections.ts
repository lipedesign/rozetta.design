import type { CollectionMode, DtcgGroup, TokenCollection } from "@/lib/dtcg/types";

export const DEFAULT_COLLECTION_MODE_ID = "default";
export const DEFAULT_COLLECTION_MODE_NAME = "Default";

export function getCollectionModes(collection: TokenCollection): CollectionMode[] {
  if (collection.modes && collection.modes.length > 0) {
    return [...collection.modes].sort((a, b) => a.position - b.position);
  }
  return [
    {
      id: collection.activeModeId ?? DEFAULT_COLLECTION_MODE_ID,
      name: DEFAULT_COLLECTION_MODE_NAME,
      isDefault: true,
      position: 0,
    },
  ];
}

export function getDefaultCollectionMode(collection: TokenCollection): CollectionMode {
  const modes = getCollectionModes(collection);
  return modes.find((mode) => mode.isDefault) ?? modes[0]!;
}

export function getActiveCollectionMode(collection: TokenCollection): CollectionMode {
  const modes = getCollectionModes(collection);
  return (
    modes.find((mode) => mode.id === collection.activeModeId) ??
    modes.find((mode) => mode.isDefault) ??
    modes[0]!
  );
}

export function getCollectionModeRoot(collection: TokenCollection, modeId?: string): DtcgGroup {
  const activeMode = modeId ?? getActiveCollectionMode(collection).id;
  return collection.modeRoots?.[activeMode] ?? collection.root;
}

export function materializeCollectionMode(
  collection: TokenCollection,
  modeId: string
): TokenCollection {
  return {
    ...collection,
    activeModeId: modeId,
    root: getCollectionModeRoot(collection, modeId),
  };
}

export function withCollectionModeRoot(
  collection: TokenCollection,
  modeId: string,
  root: DtcgGroup
): TokenCollection {
  const modeRoots = {
    ...(collection.modeRoots ?? { [getDefaultCollectionMode(collection).id]: collection.root }),
    [modeId]: root,
  };
  return {
    ...collection,
    activeModeId: modeId,
    root,
    modeRoots,
  };
}
