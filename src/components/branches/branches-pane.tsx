"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  CircleDotIcon,
  GitBranchIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createWorkspaceBranch,
  listWorkspaceBranches,
} from "@/lib/branches/actions";
import { runBranchSwitch } from "@/lib/branches/switch-state";
import type { WorkspaceBranch } from "@/lib/branches/types";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import { cn } from "@/lib/utils";

interface BranchesPaneProps {
  selectedId: string | null;
  branches: WorkspaceBranch[];
  onSelect: (id: string) => void;
  onBranchesChange: (next: WorkspaceBranch[]) => void;
}

/**
 * Left sidebar for `/branches` — mirrors `TokenSetsPane` / `ThemeGroupsPane`:
 * header label + "+" affordance, scrollable list, inline create with
 * Enter/Escape. Each row shows the branch name + active badge.
 */
export function BranchesPane({
  selectedId,
  branches,
  onSelect,
  onBranchesChange,
}: BranchesPaneProps) {
  const router = useRouter();
  const hydrateTokens = useTokensStore((state) => state.hydrate);
  const hydrateThemes = useThemesStore((state) => state.hydrate);
  const setThemeGroups = useThemesStore((state) => state.setThemeGroups);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function startCreate() {
    setCreating(true);
    setNewName("");
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
  }

  function commitCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      // makeActive: true → creating a branch auto-switches to it (Git-like UX
      // where `git switch -c <name>` lands you on the new branch). The
      // previously-active branch keeps the state it had at creation time.
      const result = await createWorkspaceBranch({ name, makeActive: true });
      if (!result.ok) {
        toast.error("Couldn't create branch", { description: result.error });
        return;
      }
      const next = await listWorkspaceBranches();
      if (next.ok) onBranchesChange(next.branches);
      onSelect(result.branch.id);
      router.refresh();
      toast.success(`On branch "${result.branch.name}"`);
      cancelCreate();
    });
  }

  function handleSwitch(branchId: string) {
    const branch = branches.find((entry) => entry.id === branchId);
    if (!branch) return;
    startTransition(async () => {
      const result = await runBranchSwitch(branchId, branch.name);
      if (!result.ok) {
        toast.error("Couldn't switch", { description: result.error });
        return;
      }
      hydrateTokens(result.snapshot.sets);
      hydrateThemes(result.snapshot.themes);
      setThemeGroups(result.snapshot.themeGroups);
      const next = await listWorkspaceBranches();
      if (next.ok) onBranchesChange(next.branches);
      onSelect(result.branch.id);
      router.refresh();
      toast.success(`On branch "${result.branch.name}"`);
    });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          Workspace Branches
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="New branch"
          onClick={startCreate}
          disabled={isPending}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-0.5 px-2 py-1">
          {branches.length === 0 && !creating ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No branches yet.
            </li>
          ) : null}

          {branches.map((branch) => (
            <li key={branch.id}>
              <div
                className={cn(
                  "group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
                  "hover:bg-muted/60",
                  selectedId === branch.id && "bg-muted font-medium"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(branch.id)}
                  aria-pressed={selectedId === branch.id}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">{branch.name}</span>
                  {branch.isActive ? (
                    <CircleDotIcon
                      className="ml-auto size-3 shrink-0 text-emerald-500"
                      aria-label="Active branch"
                    />
                  ) : null}
                </button>
                {!branch.isActive ? (
                  <button
                    type="button"
                    aria-label={`Switch to ${branch.name}`}
                    title="Switch to this branch"
                    onClick={() => handleSwitch(branch.id)}
                    disabled={isPending}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted/80 hover:text-foreground group-hover:opacity-100"
                  >
                    <ArrowRightLeftIcon className="size-3" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}

          {creating ? (
            <li>
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  ref={inputRef}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="branch name…"
                  className="h-6 flex-1 border-0 bg-transparent p-0 font-mono text-xs shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitCreate();
                    if (event.key === "Escape") cancelCreate();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={commitCreate}
                  disabled={!newName.trim() || isPending}
                >
                  <CheckIcon className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={cancelCreate}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            </li>
          ) : null}
        </ul>
      </ScrollArea>
    </aside>
  );
}
