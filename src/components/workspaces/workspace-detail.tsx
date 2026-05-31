"use client";

import { useState, useTransition } from "react";
import {
  CheckIcon,
  FolderIcon,
  LoaderCircleIcon,
  PencilIcon,
  StarIcon,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { switchWorkspace } from "@/lib/auth/actions";
import type { WorkspaceRole, WorkspaceSwitcherOption } from "@/lib/auth/types";
import { listMyWorkspaces, renameWorkspace } from "@/lib/workspaces/actions";

interface WorkspaceDetailProps {
  workspace: WorkspaceSwitcherOption | null;
  onUpsertWorkspace: (workspace: WorkspaceSwitcherOption) => void;
  onReplaceWorkspaces: (workspaces: WorkspaceSwitcherOption[]) => void;
}

const MANAGE_ROLES: ReadonlyArray<WorkspaceRole> = ["admin", "owner"];

/**
 * Right-side editor for `/workspaces`. Mirrors `ThemeWorkspace` in layout:
 * sticky header with title + actions, then a scrollable detail section.
 */
export function WorkspaceDetail({
  workspace,
  onUpsertWorkspace,
  onReplaceWorkspaces,
}: WorkspaceDetailProps) {
  if (!workspace) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>No workspace selected</EmptyTitle>
            <EmptyDescription>
              Pick a workspace on the left, or create a new one with the + button.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <WorkspaceEditor
      workspace={workspace}
      onUpsertWorkspace={onUpsertWorkspace}
      onReplaceWorkspaces={onReplaceWorkspaces}
    />
  );
}

function WorkspaceEditor({
  workspace,
  onUpsertWorkspace,
  onReplaceWorkspaces,
}: {
  workspace: WorkspaceSwitcherOption;
  onUpsertWorkspace: (workspace: WorkspaceSwitcherOption) => void;
  onReplaceWorkspaces: (workspaces: WorkspaceSwitcherOption[]) => void;
}) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [isRenaming, startRename] = useTransition();
  const [isSwitching, startSwitch] = useTransition();

  // When the user picks a different workspace on the left, drop any in-flight
  // rename draft. We compare against the current workspace id rather than
  // using useEffect (React 19 purity).
  const [lastSyncedId, setLastSyncedId] = useState(workspace.id);
  if (workspace.id !== lastSyncedId) {
    setLastSyncedId(workspace.id);
    setEditingName(null);
  }

  const canManage = MANAGE_ROLES.includes(workspace.role);

  function startEditName() {
    setEditingName(workspace.name);
  }

  function cancelEditName() {
    setEditingName(null);
  }

  function commitEditName() {
    if (editingName === null) return;
    const next = editingName.trim();
    if (!next || next === workspace.name) {
      setEditingName(null);
      return;
    }
    startRename(async () => {
      const result = await renameWorkspace({
        workspaceId: workspace.id,
        name: next,
      });
      if (!result.ok) {
        toast.error("Couldn't rename workspace", { description: result.error });
        return;
      }
      onUpsertWorkspace(result.workspace);
      setEditingName(null);
      toast.success(`Renamed to "${result.workspace.name}"`);
    });
  }

  function handleSetActive() {
    startSwitch(async () => {
      const formData = new FormData();
      formData.set("workspaceId", workspace.id);
      try {
        await switchWorkspace(formData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to switch workspace.";
        toast.error("Couldn't switch workspace", { description: message });
        return;
      }
      const refreshed = await listMyWorkspaces();
      if (refreshed.ok) {
        onReplaceWorkspaces(refreshed.workspaces);
      } else {
        // Best-effort: at least toggle the active flag client-side.
        onUpsertWorkspace({ ...workspace, isActive: true });
      }
      toast.success(`"${workspace.name}" is now the active workspace`);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="bg-background flex h-14 shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          {editingName !== null ? (
            <Input
              autoFocus
              value={editingName}
              maxLength={80}
              onChange={(event) => setEditingName(event.target.value)}
              placeholder="Workspace name"
              className="h-7 font-semibold"
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEditName();
                if (event.key === "Escape") cancelEditName();
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{workspace.name}</h1>
              <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                {workspace.role}
              </Badge>
              {workspace.isActive ? (
                <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                  Active
                </Badge>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!workspace.isActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSetActive}
              disabled={isSwitching}
            >
              {isSwitching ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <StarIcon className="size-3.5" />
              )}
              Set as active
            </Button>
          ) : null}
          {editingName !== null ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEditName}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={commitEditName} disabled={isRenaming}>
                {isRenaming ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                Save
              </Button>
            </>
          ) : canManage ? (
            <Button size="sm" variant="outline" onClick={startEditName}>
              <PencilIcon className="size-3.5" />
              Rename
            </Button>
          ) : null}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-2xl flex-col gap-6 px-6 py-5">
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide uppercase text-muted-foreground">
              Details
            </h2>
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <DetailRow label="Name" value={workspace.name} />
              <DetailRow label="Slug" value={workspace.slug} mono />
              <DetailRow label="Organization" value={workspace.organizationName} />
              <DetailRow label="Your role" value={workspace.role} />
              <DetailRow label="Workspace ID" value={workspace.id} mono />
            </dl>
          </section>

          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You need admin or owner role to rename this workspace.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate"}>{value}</dd>
    </>
  );
}
