"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, ComponentIcon, CopyIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import {
  buildSyncDiff,
  parseFigmaSyncPayload,
} from "@/lib/workspace/figma-sync";
import {
  applyFigmaSnapshotToRozettaDraft,
  prepareFigmaPayload,
  previewFigmaToRozetta,
  receiveFigmaSnapshot,
} from "@/lib/figma-bridge/actions";
import { createGitHubPrDraft, publishGitHubPr } from "@/lib/github/actions";
import type {
  FigmaBridgeState,
  FigmaFileSnapshot,
  FigmaSyncPayload,
  GitHubPrDraft,
  SyncRun,
  TokenSemanticDiff,
} from "@/lib/workspace/types";

type FigmaSyncPageProps = {
  bridgeLocalUrl: string;
  bridgePairingCode: string;
  bridgePairingExpiresAt: string;
  generatedAt: string;
  initialFigmaState: FigmaBridgeState;
  initialFigmaReview?: {
    syncRun: SyncRun;
    tokenDiff: TokenSemanticDiff;
  };
  initialPrDrafts: GitHubPrDraft[];
};

export function FigmaSyncPage({
  bridgeLocalUrl,
  bridgePairingCode,
  bridgePairingExpiresAt,
  initialFigmaState,
  initialFigmaReview,
  initialPrDrafts,
}: FigmaSyncPageProps) {
  const sets = useTokensStore((state) => state.sets);
  const importSet = useTokensStore((state) => state.importSet);
  const upsertThemes = useThemesStore((state) => state.upsertThemes);
  const [incomingText, setIncomingText] = useState("");
  const [incomingPayload, setIncomingPayload] = useState<FigmaSyncPayload | undefined>();
  const [incomingSnapshot, setIncomingSnapshot] = useState<FigmaFileSnapshot | undefined>(
    initialFigmaReview ? initialFigmaState.latestSnapshot : undefined
  );
  const [figmaState, setFigmaState] = useState(initialFigmaState);
  const [prDrafts, setPrDrafts] = useState(initialPrDrafts);
  const [figmaRun, setFigmaRun] = useState<SyncRun | undefined>(
    initialFigmaReview?.syncRun ?? initialFigmaState.lastSyncRun
  );
  const [figmaDiff, setFigmaDiff] = useState<TokenSemanticDiff | undefined>(
    initialFigmaReview?.tokenDiff
  );
  const [isReviewingLatestSnapshot, setIsReviewingLatestSnapshot] = useState(false);
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const [error, setError] = useState("");
  const syncDiff = useMemo(
    () => (incomingPayload ? buildSyncDiff(sets, incomingPayload) : undefined),
    [sets, incomingPayload]
  );

  const reviewSnapshot = useCallback(
    async (snapshot: FigmaFileSnapshot, showToast = true) => {
      if (!snapshot) return;
      setIsReviewingLatestSnapshot(true);
      const result = await previewFigmaToRozetta(snapshot);
      setIsReviewingLatestSnapshot(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setIncomingText("");
      setIncomingPayload(undefined);
      setIncomingSnapshot(snapshot);
      setFigmaRun(result.syncRun);
      setFigmaDiff(result.tokenDiff);
      if (showToast) {
        toast.success("Latest Figma snapshot ready for review", {
          description: `${result.tokenDiff.changes.length} semantic changes prepared.`,
        });
      }
    },
    []
  );

  async function reviewPayload(raw: string) {
    const parsed = parseUnknownJson(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      setIncomingPayload(undefined);
      setIncomingSnapshot(undefined);
      return;
    }

    if (isFigmaSnapshot(parsed.value)) {
      const result = await receiveFigmaSnapshot(parsed.value);
      if (!result.ok) {
        setError(result.error);
        setIncomingSnapshot(undefined);
        return;
      }
      setError("");
      setIncomingPayload(undefined);
      setIncomingSnapshot(parsed.value);
      setFigmaState(result.state);
      setFigmaRun(result.syncRun);
      setFigmaDiff(result.tokenDiff);
      toast.success("Figma snapshot received", {
        description: `${result.sets.length} collections prepared from ${parsed.value.variables.length} variables.`,
      });
      return;
    }

    const result = parseFigmaSyncPayload(raw);
    if (!result.ok) {
      setError(result.error);
      setIncomingPayload(undefined);
      setIncomingSnapshot(undefined);
      return;
    }
    setError("");
    setIncomingPayload(result.payload);
    setIncomingSnapshot(undefined);
  }

  function applyReviewedPayload() {
    if (!incomingPayload) return;
    for (const set of incomingPayload.sets) {
      const existing = sets.find((item) => item.id === set.id);
      importSet(set.name, set.root, {
        replaceId: existing?.id,
        id: set.id,
        filename: set.filename,
        modes: set.modes,
        modeRoots: set.modeRoots,
        activeModeId: set.activeModeId,
      });
    }
    upsertThemes(incomingPayload.themes);
    toast.success("Figma payload applied", {
      description: "Review dirty collections and save when you are ready to persist to disk.",
    });
  }

  async function applyReviewedFigmaSnapshot() {
    if (!incomingSnapshot) return;
    const result = await applyFigmaSnapshotToRozettaDraft(incomingSnapshot);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    for (const set of result.sets) {
      const existing = sets.find((item) => item.id === set.id);
      importSet(set.name, set.root, {
        replaceId: existing?.id,
        id: set.id,
        filename: set.filename,
        modes: set.modes,
        modeRoots: set.modeRoots,
        activeModeId: set.activeModeId,
      });
    }
    upsertThemes(result.themes);
    setFigmaRun(result.syncRun);
    setFigmaDiff(result.tokenDiff);
    toast.success("Figma snapshot applied to Rozetta draft", {
      description: "Review dirty collections and save before creating a GitHub PR.",
    });
  }

  async function copyWritebackPayload() {
    const writeback = await prepareFigmaPayload();
    await copyText(JSON.stringify(writeback, null, 2), "Figma writeback payload copied");
  }

  async function downloadWritebackPayload() {
    const writeback = await prepareFigmaPayload();
    downloadTextFile("rozetta-figma-writeback.json", JSON.stringify(writeback, null, 2));
  }

  async function draftGitHubPr() {
    const draft = await createGitHubPrDraft({
      title: "Sync Figma variables into Rozetta tokens",
      body: [
        "## Summary",
        "- Sync reviewed Figma Variables into Rozetta token artifacts.",
        "",
        "## Review",
        `- Latest Figma snapshot: ${figmaState.latestSnapshot?.name ?? "none"}`,
        `- Prepared operations: ${figmaRun?.operations.length ?? 0}`,
      ].join("\n"),
      payload: {
        figmaFileKey: figmaState.latestSnapshot?.fileKey,
        syncRunId: figmaRun?.id,
      },
    });
    setPrDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    toast.success("GitHub PR draft prepared", {
      description: draft.branchName,
    });
  }

  async function publishLatestGitHubPr() {
    const draft = prDrafts.find((item) => item.status === "draft");
    if (!draft) return;
    const result = await publishGitHubPr(draft.id);
    if (!result.ok) {
      toast.error("Couldn't publish PR", {
        description: result.error,
      });
      if (result.draft) {
        setPrDrafts((current) => current.map((item) => (item.id === result.draft!.id ? result.draft! : item)));
      }
      return;
    }
    if (result.draft) {
      setPrDrafts((current) => current.map((item) => (item.id === result.draft!.id ? result.draft! : item)));
    }
    toast.success("GitHub PR published", {
      description: result.url,
    });
  }

  const latestDraft = prDrafts[0];
  const draftToPublish = prDrafts.find((item) => item.status === "draft");
  const incomingChanges = syncDiff?.tokenDiff.changes ?? figmaDiff?.changes ?? [];
  const latestSnapshot = figmaState.latestSnapshot;
  const latestSnapshotModeCount =
    latestSnapshot?.collections.reduce((count, collection) => count + collection.modes.length, 0) ?? 0;
  const recentRuns = (figmaRun
    ? [figmaRun, ...figmaState.recentSyncRuns.filter((run) => run.id !== figmaRun.id)]
    : figmaState.recentSyncRuns
  ).slice(0, 5);

  const pendingRozettaToFigmaRun = figmaState.recentSyncRuns.find(
    (run) => run.direction === "rozetta-to-figma" && run.status === "draft"
  );
  const pendingFigmaToRozettaRun = figmaState.recentSyncRuns.find(
    (run) => run.direction === "figma-to-rozetta" && run.status === "draft"
  );
  const liveSyncBannerVisible = Boolean(
    pendingFigmaToRozettaRun || pendingRozettaToFigmaRun
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ComponentIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Figma sync
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Figma Sync</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pull reviewed Variables snapshots from Rozetta Bridge and push reviewed Rozetta payloads back to Figma.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="secondary">{sets.length} collections</Badge>
          <Badge variant={figmaState.latestSnapshot ? "default" : "outline"}>
            {figmaState.latestSnapshot ? `${figmaState.latestSnapshot.variables.length} variables` : "No snapshot"}
          </Badge>
          {pendingFigmaToRozettaRun ? (
            <Badge variant="default">Snapshot to review</Badge>
          ) : null}
          {pendingRozettaToFigmaRun ? (
            <Badge variant="outline">Queued for Figma</Badge>
          ) : null}
        </div>
      </header>
      {liveSyncBannerVisible ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/30 px-6 py-2 text-xs text-muted-foreground">
          <span>
            Live sync queue
            {pendingFigmaToRozettaRun ? " · Figma snapshot waiting for your review" : ""}
            {pendingRozettaToFigmaRun ? " · Rozetta draft waiting for the plugin to apply" : ""}
          </span>
          <span>Plugin polls every 3s while open.</span>
        </div>
      ) : null}

      <Tabs defaultValue="sync" className="min-h-0 flex-1">
        <div className="border-b px-6">
          <TabsList variant="line">
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="bridge" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <main className="flex flex-col">
              <Block
                title="Bridge status"
                description="Pair the local Figma plugin with this workspace, then review snapshots before applying anything."
              >
            <div className="grid gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Workspace pairing code
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Expires at {formatPairingExpiry(bridgePairingExpiresAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-md border bg-muted/30 px-3 font-mono text-xs">
                    <span className="block truncate">{bridgePairingCode}</span>
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void copyText(bridgePairingCode, "Bridge pairing code copied")}
                  >
                    <CopyIcon />
                    Copy
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                <StatusTile label="Local URL" value={bridgeLocalUrl} />
                <StatusTile label="Latest file" value={figmaState.latestSnapshot?.name ?? "None"} />
                <StatusTile label="Collections" value={figmaState.latestSnapshot?.collections.length ?? 0} />
                <StatusTile label="Bindings" value={figmaState.bindings.length} />
                <StatusTile label="PR drafts" value={prDrafts.length} />
              </div>
            </div>
              </Block>
            </main>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sync" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <main className="flex flex-col">
              <div className="grid xl:grid-cols-2">
                <Block
                  title="Push Rozetta → Figma"
                  description="Generate a writeback payload from the live workspace DB. Paste it in the plugin Writeback tab to update Figma Variables."
              className="border-b xl:border-r xl:border-b-0"
            >
              <div className="flex min-h-0 flex-col gap-5">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={copyWritebackPayload}>
                    <CopyIcon />
                    Copy writeback
                  </Button>
                  <Button type="button" onClick={downloadWritebackPayload}>
                    <DownloadIcon />
                    Download writeback
                  </Button>
                  <Button type="button" variant="secondary" onClick={draftGitHubPr}>
                    Create PR draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!draftToPublish}
                    onClick={() => void publishLatestGitHubPr()}
                  >
                    Publish PR
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Writeback source
                      </h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {sets.length} collections in Rozetta · {figmaState.bindings.length} Figma bindings
                      </p>
                    </div>
                    <StatusDot tone={figmaState.bindings.length > 0 ? "ready" : "muted"} label={figmaState.bindings.length > 0 ? "Ready" : "No bindings"} />
                  </div>
                  <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    The payload is generated on demand from Supabase/Postgres, not from a stale client copy.
                    Destructive deletes stay blocked in the plugin.
                  </p>
                </div>

                {latestDraft && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Latest PR draft
                        </h3>
                        <p className="mt-1.5 truncate text-sm font-medium">{latestDraft.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{latestDraft.branchName}</p>
                      </div>
                      <Badge variant={latestDraft.status === "published" ? "default" : "outline"}>
                        {latestDraft.status}
                      </Badge>
                    </div>
                    {latestDraft.url && (
                      <a
                        className="mt-2 block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                        href={latestDraft.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {latestDraft.url}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Block>

            <Block
              title="Pull Figma → Rozetta"
              description="Review the latest snapshot sent by Rozetta Bridge, then apply it to the Rozetta draft explicitly."
            >
              <div className="flex flex-col gap-5">
                {figmaState.latestSnapshot ? (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Latest Bridge snapshot
                        </h3>
                        <p className="mt-1.5 truncate text-sm font-medium">
                          {figmaState.latestSnapshot.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {figmaState.latestSnapshot.variables.length} variables ·{" "}
                          {figmaState.latestSnapshot.collections.length} collections ·{" "}
                          {latestSnapshotModeCount} modes ·{" "}
                          {formatSnapshotTime(figmaState.latestSnapshot.createdAt)} ·{" "}
                          {incomingChanges.length} semantic change{incomingChanges.length === 1 ? "" : "s"} prepared
                        </p>
                      </div>
                      <StatusDot
                        tone={incomingSnapshot ? "ready" : "muted"}
                        label={incomingSnapshot ? "Ready" : "Stored"}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isReviewingLatestSnapshot}
                        onClick={() => {
                          if (figmaState.latestSnapshot) void reviewSnapshot(figmaState.latestSnapshot);
                        }}
                      >
                        <UploadIcon />
                        {isReviewingLatestSnapshot ? "Reviewing..." : "Review latest snapshot"}
                      </Button>
                      <Button
                        type="button"
                        disabled={!incomingSnapshot}
                        onClick={() => void applyReviewedFigmaSnapshot()}
                      >
                        <CheckIcon />
                        Apply to Rozetta draft
                      </Button>
                    </div>
                  </div>
                ) : (
                  <EmptyLine>No Bridge snapshot received yet. Send one from the Figma plugin.</EmptyLine>
                )}

                <div className="border-t pt-4">
                  <button
                    type="button"
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setLegacyImportOpen((value) => !value)}
                  >
                    <ChevronDownIcon className={`size-3 transition-transform ${legacyImportOpen ? "rotate-180" : ""}`} />
                    Manual JSON fallback
                  </button>
                  {legacyImportOpen ? (
                    <div className="mt-3 flex flex-col gap-3">
                      <Input
                        type="file"
                        accept="application/json,.json"
                        aria-label="Figma sync payload"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const text = await file.text();
                          setIncomingText(text);
                          void reviewPayload(text);
                        }}
                      />
                      <Textarea
                        value={incomingText}
                        onChange={(event) => setIncomingText(event.target.value)}
                        placeholder="Paste a Rozetta Figma Sync v1 payload..."
                        className="min-h-28 font-mono text-xs"
                        aria-label="Figma sync payload JSON"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => void reviewPayload(incomingText)}>
                          <UploadIcon />
                          Review legacy import
                        </Button>
                        <Button type="button" disabled={!incomingPayload} onClick={applyReviewedPayload}>
                          <CheckIcon />
                          Apply legacy payload
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
                </Block>
              </div>
            </main>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <main className="flex flex-col">
              <Block
                title="Incoming diff"
                description="Semantic token changes between the current workspace and the reviewed incoming source."
                className="border-b"
              >
            {!syncDiff && !figmaDiff ? (
              <EmptyLine>Review the latest Bridge snapshot or upload a payload to inspect changes before applying.</EmptyLine>
            ) : incomingChanges.length === 0 ? (
              <EmptyLine>The incoming payload matches the current collections.</EmptyLine>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Collection / mode</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomingChanges.map((change) => (
                    <TableRow key={change.id}>
                      <TableCell>
                        <Badge variant={change.kind.includes("removed") ? "destructive" : "outline"}>
                          {change.kind}
                        </Badge>
                      </TableCell>
                      <TableCell>{change.setName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {change.path ?? "Set-level change"}
                      </TableCell>
                      <TableCell className="max-w-xl whitespace-normal text-xs text-muted-foreground">
                        {change.before ?? "none"} {"->"} {change.after ?? "none"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Block>

          <Block title="Recent sync runs" description="Operational history from the local runtime database.">
            {recentRuns.length === 0 ? (
              <EmptyLine>No sync runs yet. Paste a Figma plugin snapshot to start.</EmptyLine>
            ) : (
              <div className="flex flex-col">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{run.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {run.direction} · {run.operations.length} operations
                      </div>
                    </div>
                    <Badge variant={run.status === "applied" ? "default" : "outline"}>{run.status}</Badge>
                  </div>
                ))}
              </div>
            )}
              </Block>
            </main>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function Block({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`px-6 py-6 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function StatusDot({ tone, label }: { tone: "ready" | "muted"; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
      <span
        className={`size-1.5 rounded-full ${
          tone === "ready" ? "bg-emerald-500" : "bg-muted-foreground/30"
        }`}
      />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function formatPairingExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(11, 16)} UTC`;
}


function parseUnknownJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: "Payload is not valid JSON." };
  }
}

function isFigmaSnapshot(value: unknown): value is FigmaFileSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<FigmaFileSnapshot>;
  return (
    typeof snapshot.fileKey === "string" &&
    typeof snapshot.name === "string" &&
    Array.isArray(snapshot.collections) &&
    Array.isArray(snapshot.variables)
  );
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${filename}`);
}
