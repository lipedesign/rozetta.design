"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ComponentIcon, CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  applyFigmaIncoming,
  dismissFigmaIncoming,
  getLatestFigmaIncoming,
  type IncomingFigmaSnapshotSummary,
} from "@/lib/figma-bridge/actions";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";

const POLL_INTERVAL_MS = 4000;
const SEEN_KEY = "rozetta-studio:figma-incoming:dismissed:v1";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // Storage quota / SSR mismatch — non-fatal.
  }
}

/**
 * Global side sheet mounted in `ProductShell`. Polls the server every few
 * seconds for the latest `figma-to-rozetta` draft and pops up on any route when
 * the plugin has sent a snapshot, asking the user to confirm or dismiss.
 *
 * Dismissed snapshot ids are remembered in `localStorage` so closing the sheet
 * doesn't re-trigger it on the next poll.
 */
export function FigmaIncomingSheet() {
  const router = useRouter();
  const hydrateTokens = useTokensStore((state) => state.hydrate);
  const hydrateThemes = useThemesStore((state) => state.hydrate);
  const [incoming, setIncoming] = useState<IncomingFigmaSnapshotSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dismissedRef = useRef<string[]>([]);

  useEffect(() => {
    dismissedRef.current = readDismissed();
    let cancelled = false;

    async function poll() {
      try {
        const latest = await getLatestFigmaIncoming();
        if (cancelled) return;
        if (!latest) {
          setIncoming(null);
          setOpen(false);
          return;
        }
        if (dismissedRef.current.includes(latest.syncRunId)) return;
        setIncoming(latest);
        setOpen(true);
      } catch {
        // Network blip during dev — swallow, next tick retries.
      }
    }

    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function confirmApply() {
    if (!incoming) return;
    const id = incoming.syncRunId;
    startTransition(async () => {
      const result = await applyFigmaIncoming();
      if (!result.ok) {
        toast.error("Couldn't apply Figma changes", { description: result.error });
        return;
      }
      hydrateTokens(result.sets);
      hydrateThemes(result.themes);
      router.refresh();
      dismissedRef.current = [...dismissedRef.current, id];
      writeDismissed(dismissedRef.current);
      toast.success("Figma changes applied", {
        description: `${result.appliedTokenSets} collections, ${result.appliedThemes} themes updated.`,
      });
      setOpen(false);
      setIncoming(null);
    });
  }

  function dismiss() {
    if (!incoming) return;
    const id = incoming.syncRunId;
    startTransition(async () => {
      const result = await dismissFigmaIncoming(id);
      if (!result.ok) {
        toast.error("Couldn't dismiss", { description: result.error });
        return;
      }
      dismissedRef.current = [...dismissedRef.current, id];
      writeDismissed(dismissedRef.current);
      setOpen(false);
      setIncoming(null);
    });
  }

  if (!incoming) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className={cn(
          "sm:max-w-md!",
          "data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto",
          "flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
        )}
      >
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <ComponentIcon className="size-4" />
            Figma sent changes
          </div>
          <SheetTitle className="mt-1">Review {incoming.fileName}</SheetTitle>
          <SheetDescription>
            The Rozetta Bridge plugin just pushed a snapshot. Apply the changes
            to your workspace or dismiss this notification.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5 text-sm">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </div>
            <div className="mt-1 font-medium">{incoming.summary}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {incoming.operationCount} reviewed operation
              {incoming.operationCount === 1 ? "" : "s"} prepared · received at{" "}
              {formatReceived(incoming.createdAt)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: to see the full per-token diff, open <code>/sync/figma</code> →
            Sync tab. Apply here for the quick path.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={dismiss}
            disabled={isPending}
          >
            <XIcon />
            Dismiss
          </Button>
          <Button type="button" size="sm" onClick={confirmApply} disabled={isPending}>
            <CheckIcon />
            Apply to Rozetta
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatReceived(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(11, 19)} UTC`;
}
