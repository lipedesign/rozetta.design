"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  FilePlusIcon,
  FolderPlusIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { flattenTokens, walkGroups } from "@/lib/dtcg/parser";
import { ALL_SETS_ID, useTokensStore } from "@/lib/stores/tokens-store";
import type { TokenSet } from "@/lib/dtcg/types";

interface SetTreeNode {
  key: string;
  path: string;
  count: number;
  children: SetTreeNode[];
}

interface SetTreeData {
  setId: string;
  setName: string;
  totalCount: number;
  dirty: boolean;
  groups: SetTreeNode[];
}

export function TokenSetsPane() {
  const sets = useTokensStore((s) => s.sets);
  const originals = useTokensStore((s) => s.originals);
  const activeSetId = useTokensStore((s) => s.activeSetId);
  const activeGroupPath = useTokensStore((s) => s.activeGroupPath);
  const selectSet = useTokensStore((s) => s.selectSet);
  const selectGroup = useTokensStore((s) => s.selectGroup);
  const searchQuery = useTokensStore((s) => s.searchQuery);
  const setSearchQuery = useTokensStore((s) => s.setSearchQuery);
  const importSet = useTokensStore((s) => s.importSet);
  const discardSet = useTokensStore((s) => s.discardSet);
  const createToken = useTokensStore((s) => s.createToken);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const trees = useMemo<SetTreeData[]>(() => sets.map((set) => buildSetTree(set, originals)), [sets, originals]);
  const totalTokens = useMemo(() => trees.reduce((acc, tree) => acc + tree.totalCount, 0), [trees]);

  function startCreating() {
    setCreating(true);
    setNewName("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitCreate() {
    const name = newName.trim();
    if (name) importSet(name, {});
    setCreating(false);
    setNewName("");
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
  }

  function toggleSet(setId: string) {
    setExpandedSets((current) => ({ ...current, [setId]: !current[setId] }));
  }

  function toggleGroup(setId: string, path: string) {
    const key = `${setId}:${path}`;
    setExpandedGroups((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Collections
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="ghost" className="size-7" aria-label="Create new…" />
            }
          >
            <PlusIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Create new</DropdownMenuLabel>
              <DropdownMenuItem onClick={startCreating}>
                <FolderPlusIcon />
                Collection
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => createToken()} disabled={sets.length === 0}>
                <FilePlusIcon />
                Token
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search tokens"
          />
        </InputGroup>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-0.5 px-2 py-1">
          <AllTokensRow
            count={totalTokens}
            active={activeSetId === ALL_SETS_ID && !activeGroupPath}
            onSelect={() => selectSet(ALL_SETS_ID)}
          />

          {trees.map((tree) => (
            <SetTreeRow
              key={tree.setId}
              tree={tree}
              expanded={expandedSets[tree.setId] ?? false}
              expandedGroups={expandedGroups}
              activeSetId={activeSetId}
              activeGroupPath={activeGroupPath}
              onToggleSet={() => toggleSet(tree.setId)}
              onToggleGroup={(path) => toggleGroup(tree.setId, path)}
              onSelectSet={() => selectSet(tree.setId)}
              onSelectGroup={(path) => {
                selectSet(tree.setId);
                selectGroup(path);
              }}
              onDiscardSet={tree.dirty ? () => discardSet(tree.setId) : undefined}
            />
          ))}

          {creating && (
            <li>
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name…"
                  className="h-6 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCreate();
                    if (e.key === "Escape") cancelCreate();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={commitCreate}
                  disabled={!newName.trim()}
                >
                  <CheckIcon className="size-3" />
                </Button>
                <Button size="icon" variant="ghost" className="size-5 shrink-0" onClick={cancelCreate}>
                  <XIcon className="size-3" />
                </Button>
              </div>
            </li>
          )}
        </ul>
      </ScrollArea>
    </aside>
  );
}

function AllTokensRow({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          "hover:bg-muted/60",
          active && "bg-muted font-medium"
        )}
        aria-pressed={active}
      >
        <span className="flex min-w-0 items-center gap-2">
          <LayersIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate">All collections</span>
        </span>
        <span className={cn("shrink-0 font-mono text-xs tabular-nums", active ? "" : "text-muted-foreground")}>
          {count}
        </span>
      </button>
    </li>
  );
}

interface SetTreeRowProps {
  tree: SetTreeData;
  expanded: boolean;
  expandedGroups: Record<string, boolean>;
  activeSetId: string | undefined;
  activeGroupPath: string;
  onToggleSet: () => void;
  onToggleGroup: (path: string) => void;
  onSelectSet: () => void;
  onSelectGroup: (path: string) => void;
  onDiscardSet?: () => void;
}

function SetTreeRow({
  tree,
  expanded,
  expandedGroups,
  activeSetId,
  activeGroupPath,
  onToggleSet,
  onToggleGroup,
  onSelectSet,
  onSelectGroup,
  onDiscardSet,
}: SetTreeRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActiveSet = activeSetId === tree.setId && !activeGroupPath;
  const isSetOrChildActive = activeSetId === tree.setId;
  const hasChildren = tree.groups.length > 0;

  return (
    <li>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open) setMenuOpen(false);
        }}
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={hasChildren ? onToggleSet : onSelectSet}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {hasChildren ? (
              <ChevronRightIcon className={cn("size-3 transition-transform", expanded && "rotate-90")} />
            ) : null}
          </button>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                onClick={onSelectSet}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (onDiscardSet) setMenuOpen(true);
                }}
                className={cn(
                  "group flex flex-1 items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-muted/60",
                  isActiveSet && "bg-muted font-medium",
                  !isActiveSet && isSetOrChildActive && "text-foreground"
                )}
                aria-pressed={isActiveSet}
                title={tree.dirty ? `${tree.setName} • unsaved changes` : undefined}
              />
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  tree.dirty ? "bg-amber-500" : "bg-muted-foreground/40"
                )}
              />
              <span className="truncate">{tree.setName}</span>
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-xs tabular-nums",
                tree.dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
              )}
            >
              {tree.totalCount}
            </span>
          </DropdownMenuTrigger>
        </div>
        {onDiscardSet && (
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDiscardSet();
              }}
            >
              <Trash2Icon />
              Discard changes
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>

      {hasChildren && expanded && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {tree.groups.map((node) => (
            <GroupTreeRow
              key={node.path}
              setId={tree.setId}
              node={node}
              depth={1}
              expandedGroups={expandedGroups}
              activeSetId={activeSetId}
              activeGroupPath={activeGroupPath}
              onToggleGroup={onToggleGroup}
              onSelectGroup={onSelectGroup}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface GroupTreeRowProps {
  setId: string;
  node: SetTreeNode;
  depth: number;
  expandedGroups: Record<string, boolean>;
  activeSetId: string | undefined;
  activeGroupPath: string;
  onToggleGroup: (path: string) => void;
  onSelectGroup: (path: string) => void;
}

function GroupTreeRow({
  setId,
  node,
  depth,
  expandedGroups,
  activeSetId,
  activeGroupPath,
  onToggleGroup,
  onSelectGroup,
}: GroupTreeRowProps) {
  const expanded = expandedGroups[`${setId}:${node.path}`] ?? false;
  const isActive = activeSetId === setId && activeGroupPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={hasChildren ? () => onToggleGroup(node.path) : () => onSelectGroup(node.path)}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            <ChevronRightIcon className={cn("size-3 transition-transform", expanded && "rotate-90")} />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onSelectGroup(node.path)}
          className={cn(
            "flex flex-1 items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors",
            "hover:bg-muted/60",
            isActive && "bg-muted font-medium"
          )}
          aria-pressed={isActive}
        >
          <span className="min-w-0 truncate font-mono text-[13px]">{node.key}</span>
          <span className={cn("shrink-0 font-mono text-xs tabular-nums", isActive ? "" : "text-muted-foreground")}>
            {node.count}
          </span>
        </button>
      </div>

      {hasChildren && expanded && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {node.children.map((child) => (
            <GroupTreeRow
              key={child.path}
              setId={setId}
              node={child}
              depth={depth + 1}
              expandedGroups={expandedGroups}
              activeSetId={activeSetId}
              activeGroupPath={activeGroupPath}
              onToggleGroup={onToggleGroup}
              onSelectGroup={onSelectGroup}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function buildSetTree(set: TokenSet, originals: Record<string, unknown>): SetTreeData {
  const root: SetTreeNode = { key: set.name, path: "", count: 0, children: [] };

  for (const { path } of walkGroups(set.root)) {
    if (!path) continue;
    const segments = path.split(".");
    let cursor = root;
    for (let i = 0; i < segments.length; i++) {
      const segPath = segments.slice(0, i + 1).join(".");
      let next = cursor.children.find((child) => child.path === segPath);
      if (!next) {
        next = { key: segments[i], path: segPath, count: 0, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
  }

  const tokens = flattenTokens(set);
  for (const token of tokens) {
    const segments = token.path.split(".");
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segPath = segments.slice(0, i + 1).join(".");
      const child = cursor.children.find((node) => node.path === segPath);
      if (!child) break;
      child.count += 1;
      cursor = child;
    }
  }

  const dirty = (() => {
    const original = originals[set.id];
    if (!original) return true;
    return JSON.stringify(set.root) !== JSON.stringify(original);
  })();

  return {
    setId: set.id,
    setName: set.name,
    totalCount: tokens.length,
    dirty,
    groups: root.children,
  };
}
