"use client";

import { useState, useTransition } from "react";
import { CopyIcon, LoaderCircleIcon, PlugZapIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { regenerateBridgePairingCode } from "@/lib/settings/actions";
import type { FigmaBridgeState } from "@/lib/workspace/types";

interface BridgeSettingsPanelProps {
  state: FigmaBridgeState;
}

interface PairingDisplay {
  code: string;
  expiresAt: string;
}

/**
 * Bridge panel — read-only summary of Figma bridge pairing state plus a
 * "regenerate pairing code" affordance. We do NOT persist regenerated codes
 * server-side: they're ephemeral display values that the plugin pastes once.
 */
export function BridgeSettingsPanel({ state }: BridgeSettingsPanelProps) {
  const [pairing, setPairing] = useState<PairingDisplay | undefined>();
  const [isPending, startTransition] = useTransition();

  const latest = state.latestSnapshot;
  const lastRun = state.lastSyncRun;

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateBridgePairingCode();
      if (!result.ok) {
        toast.error("Could not regenerate pairing code", { description: result.error });
        return;
      }
      setPairing({ code: result.code, expiresAt: result.expiresAt });
      toast.success("New pairing code ready");
    });
  }

  function handleCopy() {
    if (!pairing) return;
    navigator.clipboard.writeText(pairing.code).then(
      () => toast.success("Pairing code copied"),
      () => toast.error("Couldn't copy pairing code")
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Figma plugin bridge</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The Rozetta Bridge Figma plugin pairs with this workspace via a temporary code. Read-only summary
            below; full Bridge management lives on
            <a className="ml-1 underline underline-offset-4" href="/sync/figma">
              /sync/figma
            </a>
            .
          </p>
        </div>
        <div className="flex flex-col">
          <InfoRow
            label="Pairing status"
            value={latest ? "Paired" : "Not paired"}
            badge={latest ? "default" : "outline"}
          />
          <InfoRow
            label="Latest Figma file"
            value={latest?.name ?? "No snapshot received"}
          />
          <InfoRow
            label="Latest snapshot"
            value={latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : "—"}
          />
          <InfoRow
            label="Last sync run"
            value={lastRun ? `${lastRun.status} · ${new Date(lastRun.createdAt).toLocaleString()}` : "—"}
          />
          <InfoRow
            label="Bindings"
            value={`${state.bindings.length} variable binding${state.bindings.length === 1 ? "" : "s"}`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Pairing code</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a fresh signed code and paste it into the plugin to re-pair. Codes expire after 30 minutes and
              are never persisted server-side.
            </p>
          </div>
          <Button type="button" onClick={handleRegenerate} disabled={isPending}>
            {isPending ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
            Regenerate
          </Button>
        </div>

        {pairing ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Expires {new Date(pairing.expiresAt).toLocaleString()}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                <CopyIcon />
                Copy
              </Button>
            </div>
            <code className="block break-all rounded bg-muted px-3 py-2 font-mono text-xs">
              {pairing.code}
            </code>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PlugZapIcon />
              </EmptyMedia>
              <EmptyTitle>No code generated yet</EmptyTitle>
              <EmptyDescription>
                Click Regenerate to create a one-time signed code for the Figma plugin.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "default" | "outline";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant={badge}>{value}</Badge>
      ) : (
        <span className="truncate font-medium">{value}</span>
      )}
    </div>
  );
}
