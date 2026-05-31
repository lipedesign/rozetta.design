"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { BotIcon, CopyIcon, LightbulbIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TokenSet } from "@/lib/dtcg/types";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { proposeDesignSystemPatch } from "@/lib/design-system/registry";
import { ALL_SETS_ID, useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";
import { diffTokenSets } from "@/lib/workspace/diff";
import { generateReleaseDraft } from "@/lib/workspace/releases";
import type { GitStatusSummary } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

interface AiPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baselineSets?: TokenSet[];
  git?: GitStatusSummary;
}

export function AiPanel({ open, onOpenChange, baselineSets = [], git }: AiPanelProps) {
  const sets = useTokensStore((state) => state.sets);
  const originals = useTokensStore((state) => state.originals);
  const selectedToken = useTokensStore((state) => state.selectedToken);
  const activeSetId = useTokensStore((state) => state.activeSetId);
  const themes = useThemesStore((state) => state.themes);
  const brands = useDesignSystemStore((state) => state.brands);
  const components = useDesignSystemStore((state) => state.components);

  const dirtySetIds = useMemo(
    () =>
      sets
        .filter((set) => {
          const original = originals[set.id];
          if (!original) return true;
          return JSON.stringify(set.root) !== JSON.stringify(original);
        })
        .map((set) => set.id),
    [originals, sets]
  );
  const localOnlySetIds = useMemo(
    () => sets.filter((set) => !originals[set.id]).map((set) => set.id),
    [originals, sets]
  );
  const health = useMemo(
    () => buildWorkspaceHealth({ sets, themes, brands, components, dirtySetIds, localOnlySetIds, git }),
    [sets, themes, brands, components, dirtySetIds, localOnlySetIds, git]
  );
  const dsProposal = useMemo(
    () => proposeDesignSystemPatch(health.issues),
    [health.issues]
  );
  const releaseNotes = useMemo(() => {
    if (baselineSets.length === 0) return "";
    return generateReleaseDraft(diffTokenSets(baselineSets, sets), "patch").notes;
  }, [baselineSets, sets]);
  const namingSuggestions = useMemo(
    () => buildNamingSuggestions(selectedToken?.path, activeSetId),
    [selectedToken?.path, activeSetId]
  );
  const issuePrompt = useMemo(() => {
    const issueLines = health.issues
      .slice(0, 12)
      .map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.detail} Action: ${issue.action}`);
    return [
      "Explain these Rozetta workspace issues and propose safe fixes.",
      "",
      `Workspace: ${health.summary.sets} sets, ${health.summary.tokens} tokens, ${health.summary.themes} themes.`,
      ...issueLines,
    ].join("\n");
  }, [health]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "sm:max-w-xl!",
          "data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto",
          "flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
        )}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            AI Panel
          </SheetTitle>
          <div className="flex items-start justify-between gap-3">
            <SheetDescription>
              Safe, provider-agnostic assistance. Suggestions are copied or reviewed; nothing is applied automatically.
            </SheetDescription>
            <Button nativeButton={false} size="sm" variant="outline" render={<Link href="/ai" />}>
              <BotIcon />
              Open AI Assistant
            </Button>
          </div>
        </SheetHeader>

        <Tabs defaultValue="issues" className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-4 py-2">
            <TabsList>
              <TabsTrigger value="issues">Issues</TabsTrigger>
              <TabsTrigger value="names">Names</TabsTrigger>
              <TabsTrigger value="fixes">Fixes</TabsTrigger>
              <TabsTrigger value="ds">DS</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="issues" className="m-0 p-4">
              <PanelSection
                title="Explain workspace issues"
                actionText="Copy issue prompt"
                onCopy={() => copyText(issuePrompt, "Issue prompt copied")}
              >
                {health.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No validation issues detected.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {health.issues.slice(0, 8).map((issue) => (
                      <div key={issue.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{issue.title}</div>
                          <Badge variant={issue.severity === "error" ? "destructive" : "outline"}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                        <p className="mt-2 text-xs">{issue.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </PanelSection>
            </TabsContent>

            <TabsContent value="names" className="m-0 p-4">
              <PanelSection
                title="Suggest token names"
                actionText="Copy name ideas"
                onCopy={() => copyText(namingSuggestions.join("\n"), "Name ideas copied")}
              >
                <div className="flex flex-col gap-2">
                  {namingSuggestions.map((name) => (
                    <div key={name} className="rounded-lg border bg-muted/20 px-3 py-2 font-mono text-xs">
                      {name}
                    </div>
                  ))}
                </div>
              </PanelSection>
            </TabsContent>

            <TabsContent value="fixes" className="m-0 p-4">
              <PanelSection
                title="Propose safe fixes"
                actionText="Copy fix plan"
                onCopy={() => copyText(buildFixPlan(health.issues), "Fix plan copied")}
              >
                <div className="flex flex-col gap-2">
                  {health.issues.slice(0, 8).map((issue) => (
                    <div key={issue.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 font-medium">
                        <LightbulbIcon className="size-4" />
                        {issue.source.kind}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{issue.action}</p>
                    </div>
                  ))}
                  {health.issues.length === 0 && (
                    <p className="text-sm text-muted-foreground">No fixes to propose right now.</p>
                  )}
                </div>
              </PanelSection>
            </TabsContent>

            <TabsContent value="notes" className="m-0 p-4">
              <PanelSection
                title="Generate release notes"
                actionText="Copy release notes"
                onCopy={() => copyText(releaseNotes || "No Git baseline diff is available on this route.", "Release notes copied")}
              >
                {releaseNotes ? (
                  <pre className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed">
                    {releaseNotes}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open Branches or Releases to give the panel a Git baseline for generated release notes.
                  </p>
                )}
              </PanelSection>
            </TabsContent>

            <TabsContent value="ds" className="m-0 p-4">
              <PanelSection
                title="Propose DS patches"
                actionText="Copy DS proposal"
                onCopy={() => copyText(JSON.stringify(dsProposal, null, 2), "DS proposal copied")}
              >
                <div className="flex flex-col gap-2">
                  {dsProposal.proposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No design system registry issues detected.</p>
                  ) : (
                    dsProposal.proposals.map((proposal) => (
                      <div key={proposal.id} className="rounded-lg border p-3">
                        <div className="font-medium">{proposal.title}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{proposal.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </PanelSection>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function PanelSection({
  title,
  actionText,
  onCopy,
  children,
}: {
  title: string;
  actionText: string;
  onCopy: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>
          <CopyIcon />
          {actionText}
        </Button>
      </div>
      {children}
    </section>
  );
}

function buildNamingSuggestions(path: string | undefined, activeSetId: string | undefined): string[] {
  if (path) {
    const segments = path.split(".");
    const leaf = segments.at(-1) ?? "default";
    const parent = segments.slice(0, -1).join(".");
    return [
      parent ? `${parent}.${leaf}.default` : `${leaf}.default`,
      parent ? `${parent}.${leaf}.strong` : `${leaf}.strong`,
      parent ? `${parent}.${leaf}.inverse` : `${leaf}.inverse`,
    ];
  }
  const prefix = activeSetId && activeSetId !== ALL_SETS_ID ? activeSetId : "semantic";
  return [
    `${prefix}.color.surface.default`,
    `${prefix}.spacing.stack.md`,
    `${prefix}.typography.body.default`,
  ];
}

function buildFixPlan(issues: ReturnType<typeof buildWorkspaceHealth>["issues"]): string {
  if (issues.length === 0) return "No workspace issues detected.";
  return issues
    .slice(0, 12)
    .map((issue, index) => `${index + 1}. ${issue.title}\nSource: ${issue.source.kind}\nAction: ${issue.action}`)
    .join("\n\n");
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
