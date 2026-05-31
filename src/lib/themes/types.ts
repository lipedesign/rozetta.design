/**
 * Design Token Themes.
 *
 * A Theme is a named, ordered list of token-set references. When resolving
 * a theme for export (or live preview), sets are merged in order and the
 * last set that defines a given path wins (Tokens Studio semantics).
 *
 * Each entry in `sets` can be in one of three modes (also matching Tokens
 * Studio):
 *
 *   - "enabled"  → tokens are included AND override previous layers
 *   - "source"   → tokens are included but serve as a fallback (appear first
 *                  in merge order regardless of list position — not implemented
 *                  in this MVP, reserved as UX affordance)
 *   - "disabled" → set is excluded from the merge entirely
 *
 * For MVP we only enforce "enabled" / "disabled"; "source" is stored but
 * treated the same as "enabled" during resolution.
 */

export type ThemeCollectionState = "enabled" | "source" | "disabled";
export type ThemeSetMode = ThemeCollectionState;

export interface ThemeSetRef {
  /** id matching a TokenCollection.id */
  collectionId?: string;
  /** legacy id matching a TokenSet.id */
  setId: string;
  /** optional Collection Mode id */
  modeId?: string;
  /** inclusion state for the collection/mode reference */
  state?: ThemeCollectionState;
  /** legacy inclusion state name */
  mode: ThemeSetMode;
}

export interface Theme {
  id: string;
  /** Theme Group that owns this Theme (Tokens Studio model). */
  themeGroupId?: string;
  name: string;
  description?: string;
  /** Order within the parent Theme Group. */
  position?: number;
  /** Ordered list — later entries override earlier ones (last-wins). */
  sets: ThemeSetRef[];
  /** ISO timestamp of last edit, used for display only. */
  updatedAt: string;
}

export interface ThemeGroup {
  id: string;
  name: string;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}
