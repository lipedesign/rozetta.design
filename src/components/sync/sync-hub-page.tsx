"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CodeIcon,
  ComponentIcon,
  FileJsonIcon,
  PaletteIcon,
  PlugZapIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { SyncConnector, SyncConnectorKind } from "@/lib/workspace/types";

interface SyncHubPageProps {
  connectors: SyncConnector[];
}

type ConnectorGroupKey = "design" | "code" | "file" | "other";

interface ConnectorGroup {
  key: ConnectorGroupKey;
  label: string;
  description: string;
  connectors: SyncConnector[];
}

const GROUP_ORDER: ConnectorGroupKey[] = ["design", "file", "code", "other"];

const GROUP_META: Record<ConnectorGroupKey, { label: string; description: string }> = {
  design: {
    label: "Design",
    description: "Two-way sync with design tools.",
  },
  file: {
    label: "Files",
    description: "Portable token formats and exports.",
  },
  code: {
    label: "Code",
    description: "Generated artifacts and package bindings.",
  },
  other: {
    label: "More",
    description: "Future and experimental adapters.",
  },
};

export function SyncHubPage({ connectors }: SyncHubPageProps) {
  const activeCount = connectors.filter((c) => c.readiness === "active").length;
  const groups = groupConnectors(connectors);
  const isMultiGroup = groups.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZapIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Connector Hub
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connector Hub</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Two-way sync between Rozetta and the tools your team already uses — design,
            code, files, and what comes next.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {connectors.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {connectors.length === 1 ? "connector available" : "connectors available"}
          </span>
          {connectors.length > 0 ? (
            <Badge variant="secondary" className="mt-1">
              {activeCount} active
            </Badge>
          ) : null}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 px-6 py-6">
          {connectors.length === 0 ? (
            <EmptyConnectors />
          ) : isMultiGroup ? (
            groups.map((group, index) => (
              <ConnectorGroupSection
                key={group.key}
                group={group}
                isLast={index === groups.length - 1}
              />
            ))
          ) : (
            <ConnectorGrid connectors={connectors} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConnectorGroupSection({
  group,
  isLast,
}: {
  group: ConnectorGroup;
  isLast: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{group.label}</h2>
          <span className="text-xs text-muted-foreground">{group.description}</span>
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          {group.connectors.length}
        </Badge>
      </div>
      <ConnectorGrid connectors={group.connectors} />
      {!isLast ? <Separator className="mt-2" /> : null}
    </section>
  );
}

function ConnectorGrid({ connectors }: { connectors: SyncConnector[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {connectors.map((connector) => (
        <ConnectorCard key={connector.id} connector={connector} />
      ))}
    </div>
  );
}

function ConnectorCard({ connector }: { connector: SyncConnector }) {
  const isActive = connector.readiness === "active";
  const isPlanned = connector.readiness === "planned";
  const ctaEnabled = isActive && Boolean(connector.route);

  return (
    <article
      className="group flex min-h-56 flex-col gap-4 rounded-lg border bg-background p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30"
      data-readiness={connector.readiness}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground [&_svg]:size-4">
            {connectorIcon(connector.kind)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium tracking-tight">
              {connector.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {kindLabel(connector.kind)}
            </p>
          </div>
        </div>
        <ReadinessBadge readiness={connector.readiness} />
      </div>

      <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
        {connector.description}
      </p>

      {connector.capabilities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {connector.capabilities.slice(0, 4).map((capability) => (
            <Badge key={capability} variant="outline" className="text-muted-foreground">
              {capability}
            </Badge>
          ))}
          {connector.capabilities.length > 4 ? (
            <Badge variant="outline" className="text-muted-foreground">
              +{connector.capabilities.length - 4}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-1">
        {ctaEnabled ? (
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href={connector.route!} />}
          >
            Open
            <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled aria-disabled>
            {isPlanned ? "Coming soon" : "Unavailable"}
          </Button>
        )}
      </div>
    </article>
  );
}

function ReadinessBadge({ readiness }: { readiness: SyncConnector["readiness"] }) {
  if (readiness === "active") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
        Active
      </Badge>
    );
  }
  if (readiness === "needs-setup") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1.5">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
        Needs setup
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 gap-1.5 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
      Coming soon
    </Badge>
  );
}

function EmptyConnectors() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PlugZapIcon />
        </EmptyMedia>
        <EmptyTitle>No connectors yet</EmptyTitle>
        <EmptyDescription>
          Connectors let Rozetta exchange tokens with the tools your team already uses.
          Suggest the one you need next and we will prioritize it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" disabled>
          <SparklesIcon data-icon="inline-start" className="size-3.5" />
          Suggest a connector
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function groupConnectors(connectors: SyncConnector[]): ConnectorGroup[] {
  const buckets = new Map<ConnectorGroupKey, SyncConnector[]>();
  for (const connector of connectors) {
    const key = groupForKind(connector.kind);
    const list = buckets.get(key) ?? [];
    list.push(connector);
    buckets.set(key, list);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: GROUP_META[key].label,
    description: GROUP_META[key].description,
    connectors: buckets.get(key)!,
  }));
}

function groupForKind(kind: SyncConnectorKind): ConnectorGroupKey {
  if (kind === "figma" || kind === "generic-design-tool") return "design";
  if (kind === "dtcg-file") return "file";
  if (kind === "code") return "code";
  return "other";
}

function kindLabel(kind: SyncConnectorKind): string {
  switch (kind) {
    case "figma":
      return "Figma";
    case "dtcg-file":
      return "DTCG file";
    case "code":
      return "Code";
    case "generic-design-tool":
      return "Design tool";
    default:
      return "Connector";
  }
}

function connectorIcon(kind: SyncConnectorKind): ReactNode {
  if (kind === "figma") return <ComponentIcon />;
  if (kind === "dtcg-file") return <FileJsonIcon />;
  if (kind === "code") return <CodeIcon />;
  if (kind === "generic-design-tool") return <PaletteIcon />;
  return <PlugZapIcon />;
}
