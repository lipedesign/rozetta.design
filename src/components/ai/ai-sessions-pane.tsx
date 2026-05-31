"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AiCommandSession, AiTaskKind } from "@/lib/workspace/types";

interface AiSessionsPaneProps {
  sessions: AiCommandSession[];
  onNewConversation: () => void;
  onSelectSession?: (session: AiCommandSession) => void;
  selectedSessionId?: string | null;
}

/**
 * Left sidebar for `/ai`. Minimalist by design:
 *
 *   - Light header without the all-caps + heavy weight.
 *   - Borderless search input that highlights on focus.
 *   - Sessions grouped by relative day (Today · Yesterday · This week ·
 *     Older) so timestamps stay quiet inside their group.
 *   - Each row: single-line prompt + a small colored dot for `kind` + a
 *     subtle relative time. No badge wrappers, no double-line meta noise.
 *   - Active row: muted bg + thin primary accent on the left edge.
 */
export function AiSessionsPane({
  sessions,
  onNewConversation,
  onSelectSession,
  selectedSessionId,
}: AiSessionsPaneProps) {
  const [filter, setFilter] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const groups = useMemo(() => groupSessionsByDay(sessions, filter), [sessions, filter]);
  const totalVisible = groups.reduce((acc, group) => acc + group.sessions.length, 0);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-medium tracking-tight">Sessions</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="New conversation"
          onClick={onNewConversation}
          title="New conversation"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </header>

      <div className="px-3 pb-2">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 transition-colors",
            searchFocused && "border-foreground/30 bg-background"
          )}
        >
          <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search history"
            aria-label="Search AI sessions"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <SparklesIcon className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No AI runs yet.
            </p>
          </div>
        ) : totalVisible === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>
        ) : (
          <div className="flex flex-col gap-4 px-2 pb-3">
            {groups.map((group) => (
              <section key={group.id}>
                <h3 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </h3>
                <ul className="flex flex-col divide-y divide-border/40">
                  {group.sessions.map((session) => {
                    const isActive = selectedSessionId === session.id;
                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => onSelectSession?.(session)}
                          className={cn(
                            "group relative flex w-full flex-col gap-0.5 rounded-md py-1.5 pl-3 pr-2 text-left transition-colors",
                            "hover:bg-muted/50",
                            isActive && "bg-muted"
                          )}
                        >
                          {isActive ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-2 left-0.5 w-0.5 rounded-full bg-foreground/80"
                            />
                          ) : null}
                          <span className="line-clamp-1 text-xs leading-snug text-foreground">
                            {session.promptSummary || "(no prompt)"}
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                            <span
                              aria-hidden
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                kindDotClass(session.kind)
                              )}
                            />
                            <span className="truncate">{kindLabel(session.kind)}</span>
                            <span aria-hidden className="text-muted-foreground/40">·</span>
                            <span className="shrink-0">{formatRelativeShort(session.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      <footer className="border-t px-4 py-2 text-[10px] text-muted-foreground/70">
        {sessions.length} session{sessions.length === 1 ? "" : "s"}
      </footer>
    </aside>
  );
}

interface SessionGroup {
  id: string;
  label: string;
  sessions: AiCommandSession[];
}

function groupSessionsByDay(
  sessions: AiCommandSession[],
  filter: string
): SessionGroup[] {
  const needle = filter.trim().toLowerCase();
  const filtered = sessions.filter((session) => {
    if (!needle) return true;
    return (
      session.promptSummary.toLowerCase().includes(needle) ||
      session.kind.toLowerCase().includes(needle)
    );
  });
  const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60_000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60_000;

  const buckets: Record<string, AiCommandSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };
  for (const session of sorted) {
    const ts = new Date(session.createdAt).getTime();
    if (Number.isNaN(ts)) {
      buckets.older!.push(session);
      continue;
    }
    if (ts >= startOfToday) buckets.today!.push(session);
    else if (ts >= startOfYesterday) buckets.yesterday!.push(session);
    else if (ts >= startOfWeek) buckets.week!.push(session);
    else buckets.older!.push(session);
  }
  return [
    { id: "today", label: "Today", sessions: buckets.today! },
    { id: "yesterday", label: "Yesterday", sessions: buckets.yesterday! },
    { id: "week", label: "This week", sessions: buckets.week! },
    { id: "older", label: "Older", sessions: buckets.older! },
  ].filter((group) => group.sessions.length > 0);
}

function kindLabel(kind: AiTaskKind): string {
  switch (kind) {
    case "explain-issues":
      return "Audit";
    case "propose-fixes":
      return "Fixes";
    case "release-notes":
      return "Release";
    case "suggest-names":
      return "Naming";
    case "workspace-question":
      return "Ask";
    case "design-system":
      return "Design";
    default:
      return kind;
  }
}

function kindDotClass(kind: AiTaskKind): string {
  switch (kind) {
    case "explain-issues":
      return "bg-amber-500";
    case "propose-fixes":
      return "bg-emerald-500";
    case "release-notes":
      return "bg-blue-500";
    case "suggest-names":
      return "bg-violet-500";
    case "workspace-question":
      return "bg-sky-500";
    case "design-system":
      return "bg-rose-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function formatRelativeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "now";
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h`;
  if (ms < 7 * 24 * 60 * 60_000) return `${Math.floor(ms / (24 * 60 * 60_000))}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
