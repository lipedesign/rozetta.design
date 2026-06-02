"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Code2Icon,
  ComponentIcon,
  CopyIcon,
  PlusIcon,
  SearchIcon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDesignSystemStore } from "@/lib/design-system/store";
import type {
  ComponentStatus,
  DesignSystemComponent,
} from "@/lib/workspace/types";

const COMPONENT_STATUSES: ComponentStatus[] = ["draft", "ready", "deprecated"];

export function ComponentsPage() {
  const components = useDesignSystemStore((state) => state.components);
  const activeComponentId = useDesignSystemStore((state) => state.activeComponentId);
  const createComponent = useDesignSystemStore((state) => state.createComponent);
  const selectComponent = useDesignSystemStore((state) => state.selectComponent);
  const duplicateComponent = useDesignSystemStore((state) => state.duplicateComponent);
  const deleteComponent = useDesignSystemStore((state) => state.deleteComponent);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Core");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(
    () =>
      components.filter((component) => {
        const matchesQuery = `${component.name} ${component.category} ${component.slug}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        const matchesStatus = statusFilter === "all" || component.status === statusFilter;
        return matchesQuery && matchesStatus;
      }),
    [components, query, statusFilter]
  );
  const activeComponent =
    components.find((component) => component.id === activeComponentId) ?? filtered[0] ?? null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const result = await createComponent(name, newCategory.trim() || "Core");
    if (!result.ok) toast.error(result.error);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShapesIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Component registry
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Components</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Metadata-first catalog for DS components, tokens, variants, and Figma/code bindings.
          </p>
        </div>
        <Badge variant="secondary">{components.length} components</Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="grid xl:grid-cols-[24rem_1fr]">
          <section className="flex min-w-0 flex-col border-b xl:border-r xl:border-b-0">
            <Block title="Create component" description="Saved to your workspace." className="border-b">
              <div className="flex flex-col gap-3">
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Button"
                  aria-label="Component name"
                />
                <Input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Core"
                  aria-label="Component category"
                />
                <Button type="button" onClick={handleCreate} disabled={!newName.trim()}>
                  <PlusIcon />
                  Add component
                </Button>
              </div>
            </Block>

            <Block title="Filters" description="Search by name, slug, or category." className="border-b">
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <SearchIcon className="absolute top-2 left-2 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-8"
                    placeholder="Search components"
                    aria-label="Search components"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
                  <SelectTrigger className="w-full" aria-label="Status filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="all">All statuses</SelectItem>
                    {COMPONENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Block>

            <Block title="Registry" description={`${filtered.length} visible.`}>
              {filtered.length === 0 ? (
                <EmptyLine>Create or clear filters to see components.</EmptyLine>
              ) : (
                <div className="flex flex-col">
                  {filtered.map((component) => (
                    <button
                      key={component.id}
                      type="button"
                      onClick={() => selectComponent(component.id)}
                      className="flex items-center justify-between gap-3 border-b py-2.5 text-left text-sm transition-colors last:border-b-0 hover:text-foreground data-[active=true]:font-medium"
                      data-active={component.id === activeComponent?.id}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{component.name}</span>
                        <span className="text-xs text-muted-foreground">{component.category}</span>
                      </span>
                      <Badge variant={component.status === "ready" ? "default" : "outline"}>
                        {component.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </Block>
          </section>

          <section className="flex min-w-0 flex-col">
            {activeComponent ? (
              <ComponentEditor
                key={activeComponent.id}
                component={activeComponent}
                onDuplicate={() => {
                  void duplicateComponent(activeComponent.id).then((result) => {
                    if (!result.ok) toast.error(result.error);
                  });
                }}
                onDelete={() => {
                  void deleteComponent(activeComponent.id).then((result) => {
                    if (!result.ok) toast.error(result.error);
                  });
                }}
              />
            ) : (
              <div className="px-6 py-12">
                <h2 className="text-sm font-medium">No component selected</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create or select a component to edit metadata.
                </p>
              </div>
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  );
}

function ComponentEditor({
  component,
  onDuplicate,
  onDelete,
}: {
  component: DesignSystemComponent;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const updateComponent = useDesignSystemStore((state) => state.updateComponent);
  const [draft, setDraft] = useState(component);
  const [tokenRefs, setTokenRefs] = useState(component.tokenRefs.join("\n"));
  const [variants, setVariants] = useState(component.variants.map((item) => item.name).join("\n"));
  const [props, setProps] = useState(component.props.map((item) => item.name).join("\n"));
  const [states, setStates] = useState(component.states.map((item) => item.name).join("\n"));
  const [codeBindings, setCodeBindings] = useState(
    component.bindings.code.map((binding) => binding.source).join("\n")
  );
  const [figmaBindings, setFigmaBindings] = useState(
    component.bindings.figma
      .map((binding) => [binding.fileKey, binding.nodeId, binding.componentName].filter(Boolean).join(" :: "))
      .join("\n")
  );

  async function save() {
    const result = await updateComponent(component.id, {
      ...draft,
      tokenRefs: lines(tokenRefs),
      variants: lines(variants).map((name) => ({ id: slug(name), name, values: [] })),
      props: lines(props).map((name) => ({ name, type: "string" })),
      states: lines(states).map((name) => ({ name })),
      bindings: {
        code: lines(codeBindings).map((source) => ({ source })),
        figma: lines(figmaBindings).map((line) => {
          const [fileKey, nodeId, componentName] = line.split("::").map((part) => part.trim());
          return { fileKey, nodeId, componentName };
        }),
      },
    });
    if (!result.ok) toast.error(result.error);
  }

  return (
    <Block
      title={component.name}
      description={component.id}
      action={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onDuplicate}>
            <CopyIcon />
            Duplicate
          </Button>
          <Button type="button" variant="outline" onClick={onDelete}>
            <Trash2Icon />
            Delete
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <Input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            aria-label="Component name"
          />
          <Input
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            aria-label="Component slug"
          />
          <Input
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            aria-label="Component category"
          />
          <Select
            value={draft.status}
            onValueChange={(value) => setDraft({ ...draft, status: value as ComponentStatus })}
          >
            <SelectTrigger className="w-full" aria-label="Component status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {COMPONENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={draft.description ?? ""}
            onChange={(event) => setDraft({ ...draft, description: event.target.value || undefined })}
            aria-label="Component description"
            placeholder="Description"
          />
        </div>

        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          <TextList title="Token refs" value={tokenRefs} onChange={setTokenRefs} placeholder="consumer:color.surface.default" />
          <TextList title="Variants" value={variants} onChange={setVariants} placeholder="Size\nTone" />
          <TextList title="Props" value={props} onChange={setProps} placeholder="disabled\nloading" />
          <TextList title="States" value={states} onChange={setStates} placeholder="hover\npressed" />
          <TextList title="Code bindings" value={codeBindings} onChange={setCodeBindings} placeholder="src/components/ui/button.tsx" icon={<Code2Icon />} />
          <TextList title="Figma bindings" value={figmaBindings} onChange={setFigmaBindings} placeholder="fileKey :: nodeId :: Button" icon={<ComponentIcon />} />
        </div>
        <div className="lg:col-span-2">
          <Button type="button" onClick={save}>
            Save component
          </Button>
        </div>
      </div>
    </Block>
  );
}

function TextList({
  title,
  value,
  onChange,
  placeholder,
  icon,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: ReactNode;
}) {
  return (
    <div className="border-t pt-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon && <span className="[&_svg]:size-3.5">{icon}</span>}
        {title}
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-28 font-mono text-xs"
      />
    </div>
  );
}

function Block({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`px-6 py-6 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}
