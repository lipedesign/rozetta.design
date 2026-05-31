"use client";

import { useRef, useState, useTransition } from "react";
import { CheckIcon, FolderIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkspaceSwitcherOption } from "@/lib/auth/types";
import { createWorkspace } from "@/lib/workspaces/actions";
import { cn } from "@/lib/utils";

interface WorkspacesPaneProps {
  workspaces: WorkspaceSwitcherOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpsertWorkspace: (workspace: WorkspaceSwitcherOption) => void;
}

/**
 * Left sidebar for `/workspaces` — mirrors `ThemeGroupsPane` in shape:
 *   header (label + "+" button) → list of workspaces with role + active marker.
 * Selecting a workspace makes it active in the right-side detail editor; it
 * does NOT switch the active workspace cookie (that's an explicit button on
 * the right pane).
 */
export function WorkspacesPane({
  workspaces,
  selectedId,
  onSelect,
  onUpsertWorkspace,
}: WorkspacesPaneProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function startCreate() {
    setCreating(true);
    setNewName("");
    queueMicrotask(() => inputRef.current?.focus());
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
  }

  function commitCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createWorkspace({ name });
      if (!result.ok) {
        toast.error("Couldn't create workspace", { description: result.error });
        return;
      }
      onUpsertWorkspace(result.workspace);
      onSelect(result.workspace.id);
      cancelCreate();
      toast.success(`Workspace "${result.workspace.name}" created`);
    });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          Workspaces
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Create new workspace"
          onClick={startCreate}
          disabled={creating}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-0.5 px-2 py-1">
          {workspaces.length === 0 && !creating ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No workspaces yet — click + to create one.
            </li>
          ) : null}

          {workspaces.map((workspace) => {
            const isSelected = selectedId === workspace.id;
            return (
              <li key={workspace.id}>
                <button
                  type="button"
                  onClick={() => onSelect(workspace.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                    isSelected && "bg-muted font-medium"
                  )}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.isActive ? (
                    <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                      Active
                    </Badge>
                  ) : null}
                </button>
              </li>
            );
          })}

          {creating ? (
            <li>
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  ref={inputRef}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Workspace name…"
                  maxLength={80}
                  className="h-6 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
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
                  aria-label="Confirm create workspace"
                >
                  <CheckIcon className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={cancelCreate}
                  aria-label="Cancel create workspace"
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
