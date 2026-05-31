"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateWorkspaceMeta } from "@/lib/settings/actions";
import { WORKSPACE_NAME_PATTERN } from "@/lib/settings/types";
import type { SettingsWorkspaceSummary } from "@/lib/settings/types";
import type { WorkspaceSwitcherOption } from "@/lib/auth/types";

interface WorkspaceSettingsPanelProps {
  workspace: SettingsWorkspaceSummary;
  workspaceOptions: WorkspaceSwitcherOption[];
  onUpdated: (workspace: SettingsWorkspaceSummary) => void;
}

export function WorkspaceSettingsPanel({
  workspace,
  workspaceOptions,
  onUpdated,
}: WorkspaceSettingsPanelProps) {
  const [name, setName] = useState(workspace.name);
  const [isPending, startTransition] = useTransition();

  const trimmed = name.trim();
  const dirty = trimmed !== workspace.name;
  const valid = WORKSPACE_NAME_PATTERN.test(trimmed);
  const canSubmit = dirty && valid && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await updateWorkspaceMeta({ name: trimmed });
      if (!result.ok) {
        toast.error("Could not rename workspace", { description: result.error });
        return;
      }
      onUpdated(result.workspace);
      setName(result.workspace.name);
      toast.success("Workspace renamed");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Active workspace"
        description="Workspace identity is the scope for every token, theme, and sync operation."
      >
        <div className="flex flex-col">
          <InfoRow label="Workspace ID" value={workspace.workspaceId} mono />
          <InfoRow label="Slug" value={workspace.slug} mono />
          <InfoRow label="Organization" value={workspace.organizationName} />
          <InfoRow label="Role">
            <Badge variant="outline">{workspace.role}</Badge>
          </InfoRow>
          <InfoRow label="Auth source">
            <Badge variant="outline">{workspace.source}</Badge>
          </InfoRow>
        </div>
      </Section>

      <Section
        title="Rename workspace"
        description="The slug is stable; only the display name changes. Admin or owner role required."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="flex max-w-md flex-col gap-3"
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workspace name"
            aria-label="Workspace name"
            maxLength={80}
            disabled={isPending}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {valid
                ? `${trimmed.length}/80 characters`
                : "Name must be 1–80 characters."}
            </span>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? <LoaderCircleIcon className="animate-spin" /> : <CheckCircle2Icon />}
              Save name
            </Button>
          </div>
        </form>
      </Section>

      <Section
        title="Available workspaces"
        description="Full member management is planned. This list is read-only."
      >
        {workspaceOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workspaces available.</p>
        ) : (
          <ul className="flex flex-col">
            {workspaceOptions.map((option) => (
              <li
                key={option.id}
                className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
              >
                <span className="min-w-0 truncate">{option.name}</span>
                <Badge variant={option.isActive ? "default" : "outline"}>
                  {option.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {children ?? (
        <span
          className={
            mono
              ? "truncate font-mono text-xs"
              : "truncate font-medium"
          }
        >
          {value}
        </span>
      )}
    </div>
  );
}
