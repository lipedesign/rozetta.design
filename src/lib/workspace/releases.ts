import type {
  ReleaseArtifactPreview,
  ReleaseDraft,
  ReleaseVersionKind,
  DesignSystemDiff,
  TokenChange,
  TokenSemanticDiff,
} from "./types";

const CHANGE_LABELS: Record<TokenChange["kind"], string> = {
  "set-created": "Sets created",
  "set-removed": "Sets removed",
  "token-created": "Tokens created",
  "token-removed": "Tokens removed",
  "value-changed": "Values changed",
  "type-changed": "Types changed",
  "description-changed": "Descriptions changed",
  "alias-changed": "Aliases changed",
};

export function generateReleaseDraft(
  diff: TokenSemanticDiff,
  versionKind: ReleaseVersionKind,
  designSystemDiff?: DesignSystemDiff
): ReleaseDraft {
  const designChanges = designSystemDiff?.changes ?? [];
  const meaningfulChanges = diff.changes.filter((change) => change.kind !== "description-changed");
  const breakingChanges = diff.changes.filter(
    (change) => change.kind === "set-removed" || change.kind === "token-removed" || change.kind === "type-changed"
  );
  const title = `${capitalize(versionKind)} design system release`;
  const summary =
    diff.summary.total === 0 && designChanges.length === 0
      ? "No semantic token or design system changes detected against the Git baseline."
      : `${diff.summary.total} token ${diff.summary.total === 1 ? "change" : "changes"} and ${designChanges.length} design system ${designChanges.length === 1 ? "change" : "changes"} detected.`;

  return {
    id: `draft-${versionKind}-${hashChanges(diff.changes)}`,
    versionKind,
    title,
    summary,
    notes: buildNotes(diff.changes, versionKind, breakingChanges.length, designChanges),
    changes: diff.changes,
    designSystemChanges: designChanges,
    artifacts: buildArtifacts(diff.changes, meaningfulChanges.length),
    generatedAt: new Date().toISOString(),
  };
}

function buildNotes(
  changes: TokenChange[],
  versionKind: ReleaseVersionKind,
  breakingCount: number,
  designChanges: DesignSystemDiff["changes"]
): string {
  if (changes.length === 0 && designChanges.length === 0) {
    return [
      `# ${capitalize(versionKind)} design system release`,
      "",
      "No token or design system registry changes were detected against the current Git baseline.",
    ].join("\n");
  }

  const lines = [
    `# ${capitalize(versionKind)} design system release`,
    "",
    `Summary: ${changes.length} token ${changes.length === 1 ? "change" : "changes"} and ${designChanges.length} registry ${designChanges.length === 1 ? "change" : "changes"} detected.`,
  ];

  if (breakingCount > 0) {
    lines.push(`Breaking-risk changes: ${breakingCount} removal/type ${breakingCount === 1 ? "change" : "changes"}.`);
  }

  const grouped = groupBySet(changes);
  if (grouped.length > 0) lines.push("", "## Tokens");
  for (const [setName, items] of grouped) {
    lines.push("", `### ${setName}`);
    for (const item of items.slice(0, 12)) {
      const path = item.path ?? "Set-level change";
      const detail = item.before !== undefined || item.after !== undefined
        ? ` (${item.before ?? "none"} -> ${item.after ?? "none"})`
        : "";
      lines.push(`- ${CHANGE_LABELS[item.kind]}: ${path}${detail}`);
    }
    if (items.length > 12) {
      lines.push(`- ${items.length - 12} more ${items.length - 12 === 1 ? "change" : "changes"}`);
    }
  }

  const groupedDesign = groupDesignChanges(designChanges);
  for (const [area, items] of groupedDesign) {
    lines.push("", `## ${capitalize(area)}`);
    for (const item of items.slice(0, 12)) {
      lines.push(`- ${item.kind}: ${item.name}`);
    }
    if (items.length > 12) {
      lines.push(`- ${items.length - 12} more ${items.length - 12 === 1 ? "change" : "changes"}`);
    }
  }

  return lines.join("\n");
}

function groupDesignChanges(
  changes: DesignSystemDiff["changes"]
): Array<[string, DesignSystemDiff["changes"]]> {
  const grouped = new Map<string, DesignSystemDiff["changes"]>();
  for (const change of changes) {
    grouped.set(change.area, [...(grouped.get(change.area) ?? []), change]);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function buildArtifacts(changes: TokenChange[], meaningfulCount: number): ReleaseArtifactPreview[] {
  const changedSets = Array.from(new Set(changes.map((change) => change.setName))).sort();
  const target = changedSets.length > 0 ? changedSets.join(", ") : "Current workspace";

  return [
    {
      id: "tokens-json",
      name: "Tokens JSON package",
      format: "tokens-json",
      target,
      description: `${changedSets.length || "All"} token ${changedSets.length === 1 ? "set" : "sets"} prepared as DTCG JSON.`,
    },
    {
      id: "css",
      name: "CSS variables preview",
      format: "css",
      target,
      description: `${meaningfulCount} value-bearing ${meaningfulCount === 1 ? "change" : "changes"} ready for CSS export.`,
    },
    {
      id: "style-dictionary",
      name: "Style Dictionary config",
      format: "style-dictionary",
      target: "Export profiles",
      description: "Configuration artifact placeholder for the next exporter phase.",
    },
  ];
}

function groupBySet(changes: TokenChange[]): Array<[string, TokenChange[]]> {
  const grouped = new Map<string, TokenChange[]>();
  for (const change of changes) {
    grouped.set(change.setName, [...(grouped.get(change.setName) ?? []), change]);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function hashChanges(changes: TokenChange[]): string {
  let hash = 0;
  for (const change of changes) {
    const input = `${change.id}:${change.before ?? ""}:${change.after ?? ""}`;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
  }
  return hash.toString(16);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
