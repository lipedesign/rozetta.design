"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { TokenSwatch } from "@/components/tokens/token-swatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatTokenValue } from "@/lib/dtcg/format";
import { getNodeAtPath, isAliasValue } from "@/lib/dtcg/parser";
import { readFigmaAlias, resolveToken } from "@/lib/dtcg/resolver";
import {
  DTCG_TYPES,
  isDtcgToken,
  type DtcgToken,
  type DtcgType,
  type DtcgValue,
  type TokenSet,
} from "@/lib/dtcg/types";
import { useTokensStore } from "@/lib/stores/tokens-store";

type TokensStoreState = ReturnType<typeof useTokensStore.getState>;

/**
 * Tokens-Studio-style "Edit Token" sheet. The outer component is driven by
 * `selectedToken`; the keyed form owns transient draft state so changing
 * selection remounts the form instead of reseeding state from an effect.
 */
export function TokenEditorSheet() {
  const sets = useTokensStore((s) => s.sets);
  const selected = useTokensStore((s) => s.selectedToken);
  const clearSelected = useTokensStore((s) => s.clearSelectedToken);
  const patchToken = useTokensStore((s) => s.patchToken);
  const moveToken = useTokensStore((s) => s.moveToken);

  const editorState = useMemo(() => {
    if (!selected) return undefined;
    const sourceSet = sets.find((s) => s.id === selected.setId);
    if (!sourceSet) return undefined;
    const node = getNodeAtPath(sourceSet.root, selected.path);
    if (!node || !isDtcgToken(node)) return undefined;

    const segments = selected.path.split(".");
    const tokenName = segments[segments.length - 1] ?? selected.path;
    const tokenType = (node.$type ?? "string") as DtcgType;
    let initialValueText = "";
    if (typeof node.$value === "string") initialValueText = node.$value;
    else if (typeof node.$value === "number") initialValueText = String(node.$value);
    else if (typeof node.$value === "boolean") initialValueText = String(node.$value);
    else initialValueText = JSON.stringify(node.$value);

    return {
      selected,
      sourceSet,
      sourceToken: node,
      tokenName,
      tokenType,
      initialValueText,
      initialGroupPath:
        segments.length > 1 ? segments.slice(0, -1).join(".") : "",
      isNew: selected.isNew ?? false,
    };
  }, [selected, sets]);

  return (
    <Sheet open={!!selected} onOpenChange={(next) => !next && clearSelected()}>
      <SheetContent
        side="right"
        className="sm:max-w-md! data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
      >
        {editorState ? (
          <TokenEditorForm
            key={`${editorState.selected.setId}::${editorState.selected.path}`}
            {...editorState}
            sets={sets}
            clearSelected={clearSelected}
            patchToken={patchToken}
            moveToken={moveToken}
          />
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>Token not found</SheetTitle>
              <SheetDescription>
                The selected token no longer exists in the current set.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center p-6">
              <Button variant="outline" onClick={clearSelected}>
                Close
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TokenEditorForm({
  selected,
  sourceSet,
  sourceToken,
  sets,
  tokenName,
  tokenType,
  initialValueText,
  initialGroupPath,
  isNew,
  clearSelected,
  patchToken,
  moveToken,
}: {
  selected: { setId: string; path: string; isNew?: boolean };
  sourceSet: TokenSet;
  sourceToken: DtcgToken;
  sets: TokenSet[];
  tokenName: string;
  tokenType: DtcgType;
  initialValueText: string;
  initialGroupPath: string;
  isNew: boolean;
  clearSelected: TokensStoreState["clearSelectedToken"];
  patchToken: TokensStoreState["patchToken"];
  moveToken: TokensStoreState["moveToken"];
}) {
  const [name, setName] = useState(tokenName);
  const [type, setType] = useState<DtcgType>(tokenType);
  const [valueText, setValueText] = useState(initialValueText);
  const [description, setDescription] = useState(sourceToken.$description ?? "");
  const [setId, setSetIdState] = useState(selected.setId);
  const [groupPath, setGroupPath] = useState(initialGroupPath);

  const isAlias =
    isAliasValue(sourceToken.$value) ||
    Boolean(readFigmaAlias(sourceToken)?.targetVariableName);

  const resolution = useMemo(() => {
    if (!isAlias) return undefined;
    return resolveToken(selected.setId, selected.path, {
      currentSetId: selected.setId,
      sets,
    });
  }, [isAlias, selected, sets]);

  const resolved = isAlias ? resolution?.value : sourceToken.$value;

  const duplicateValueCount = useMemo(() => {
    const target = JSON.stringify(resolved ?? sourceToken.$value);
    let count = 0;
    for (const set of sets) {
      walkAndCount(set.root, "", (path, token) => {
        if (set.id === selected.setId && path === selected.path) return;
        const tokenResolved = isAliasValue(token.$value)
          ? resolveToken(set.id, path, { currentSetId: set.id, sets }).value
          : token.$value;
        if (JSON.stringify(tokenResolved) === target) count += 1;
      });
    }
    return count;
  }, [resolved, selected, sets, sourceToken]);

  function handleSave() {
    const trimmed = valueText.trim();
    const trimmedName = name.trim();
    const trimmedGroup = groupPath.trim().replace(/^\.+|\.+$/g, "");

    if (!trimmedName) {
      toast.error("Token name is required.");
      return;
    }
    if (/[.$\s]/.test(trimmedName)) {
      toast.error("Name can't contain spaces, dots, or $.");
      return;
    }

    let nextValue: DtcgValue = sourceToken.$value;
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      nextValue = trimmed;
    } else if (type === "number") {
      const n = Number(trimmed);
      nextValue = Number.isFinite(n) ? n : trimmed;
    } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        nextValue = JSON.parse(trimmed) as DtcgValue;
      } catch {
        toast.error("Invalid JSON value");
        return;
      }
    } else {
      nextValue = trimmed;
    }

    const targetPath = trimmedGroup
      ? `${trimmedGroup}.${trimmedName}`
      : trimmedName;
    const isRenameOrMove =
      setId !== selected.setId || targetPath !== selected.path;

    if (isRenameOrMove) {
      patchToken(selected.setId, selected.path, {
        $value: nextValue,
        $type: type,
        $description: description || undefined,
      });

      const result = moveToken({
        fromSetId: selected.setId,
        fromPath: selected.path,
        toSetId: setId,
        toPath: targetPath,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        setId !== selected.setId
          ? `Moved to ${sets.find((s) => s.id === setId)?.name ?? setId} · ${targetPath}`
          : `Renamed to ${targetPath}`
      );
      clearSelected();
      return;
    }

    patchToken(selected.setId, selected.path, {
      $value: nextValue,
      $type: type,
      $description: description || undefined,
    });
    toast.success(`Updated ${selected.path}`);
    clearSelected();
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{isNew ? "Create Token" : "Edit Token"}</SheetTitle>
        <SheetDescription className="sr-only">
          {isNew
            ? "Configure and save a new design token."
            : "Inspect and edit a design token."}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="token" className="flex flex-1 flex-col overflow-hidden">
        <div className="px-4 pt-2">
          <TabsList>
            <TabsTrigger value="token">Token</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="token" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <FieldGroup className="px-4 py-4">
              <Field>
                <FieldLabel htmlFor="token-name">
                  Token Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="font-mono"
                  placeholder="my-token"
                />
                <FieldDescription>
                  Last segment of the dotted path. No spaces, dots, or $.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="token-type">
                  Token Type <span className="text-destructive">*</span>
                </FieldLabel>
                <Select value={type} onValueChange={(value) => setType(value as DtcgType)}>
                  <SelectTrigger
                    id="token-type"
                    className="w-full"
                    aria-label="Token type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DTCG_TYPES.map((dtcgType) => (
                      <SelectItem key={dtcgType} value={dtcgType}>
                        {dtcgType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="token-value">
                  Value <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="token-value"
                  value={valueText}
                  onChange={(event) => setValueText(event.target.value)}
                  className="font-mono"
                  placeholder="literal value or {alias.path}"
                />
                <FieldDescription>
                  Use{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-xs">
                    {"{group.token.name}"}
                  </code>{" "}
                  to reference another token.
                </FieldDescription>
              </Field>

              {isAlias && resolved !== undefined ? (
                <div className="bg-muted/40 flex items-center gap-3 rounded-md border p-2.5">
                  <span className="size-7 overflow-hidden rounded border">
                    <TokenSwatch
                      setId={selected.setId}
                      path={selected.path}
                      $type={type}
                      $value={sourceToken.$value}
                      token={sourceToken}
                      className="h-7 size-full rounded-none border-0"
                    />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">
                      Resolved
                    </span>
                    <span className="font-mono text-xs">
                      {formatTokenValue(resolved as DtcgValue, type)}
                    </span>
                  </div>
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="token-description">Description</FieldLabel>
                <Textarea
                  id="token-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Where and why is this token used?"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="token-set">
                  Collection <span className="text-destructive">*</span>
                </FieldLabel>
                <Select value={setId} onValueChange={(value) => setSetIdState(value ?? "")}>
                  <SelectTrigger
                    id="token-set"
                    className="w-full"
                    aria-label="Collection"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Changing the collection moves this token to that collection on save.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="token-group">Group</FieldLabel>
                <Input
                  id="token-group"
                  value={groupPath}
                  onChange={(event) => setGroupPath(event.target.value)}
                  className="font-mono"
                  placeholder="color.background"
                />
                <FieldDescription>
                  Dotted path of the parent group. Leave empty to put the token
                  at the root. Missing groups are created.
                </FieldDescription>
              </Field>

              {isAlias ? (
                <AliasChainInsight
                  resolution={resolution}
                  resolved={resolved}
                  type={type}
                />
              ) : null}

              <DuplicateInsight duplicateValueCount={duplicateValueCount} />

              <p className="text-muted-foreground/70 mt-2 text-xs">
                Source: <span className="font-mono">{sourceSet.name}</span>
                {" · "}
                <span className="font-mono">{selected.path}</span>
              </p>
            </FieldGroup>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-hidden">
          <div className="text-muted-foreground p-6 text-sm">
            Edit history is not tracked yet — this tab will show diffs vs. the
            original file once persistence ships.
          </div>
        </TabsContent>
      </Tabs>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button variant="outline" onClick={clearSelected}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          {isNew ? "Create Token" : "Update Token"}
        </Button>
      </SheetFooter>
    </>
  );
}

function AliasChainInsight({
  resolution,
  resolved,
  type,
}: {
  resolution: ReturnType<typeof resolveToken> | undefined;
  resolved: DtcgValue | undefined;
  type: DtcgType;
}) {
  return (
    <Collapsible defaultOpen>
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
        Insights
      </div>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="bg-muted/30 hover:bg-muted/50 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm"
          />
        }
      >
        <span className="flex items-center gap-2">
          Alias Chain
          <Badge variant="secondary">{resolution?.chain.length ?? 0}</Badge>
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-3 pt-2">
          {resolution?.chain.length ? (
            <ol className="flex flex-col gap-1.5">
              {resolution.chain.map((step, index) => (
                <li
                  key={`${step.setId}:${step.path}:${index}`}
                  className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs"
                >
                  <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]">
                    {index + 1}
                  </span>
                  <code className="text-foreground min-w-0 truncate">
                    {step.setId}.{step.path}
                  </code>
                  <span className="shrink-0 capitalize">
                    {step.source.replace("-", " ")}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-xs">
              Alias could not be resolved.
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Literal:{" "}
            <span className="text-foreground font-mono">
              {resolved !== undefined
                ? formatTokenValue(resolved, type)
                : `unresolved (${resolution?.error ?? "unknown"})`}
            </span>
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DuplicateInsight({
  duplicateValueCount,
}: {
  duplicateValueCount: number;
}) {
  return (
    <Collapsible defaultOpen>
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
        Insights
      </div>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="bg-muted/30 hover:bg-muted/50 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm"
          />
        }
      >
        <span className="flex items-center gap-2">
          Duplicate Values
          <Badge variant="secondary">{duplicateValueCount}</Badge>
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="text-muted-foreground px-3 pt-2 text-xs">
          {duplicateValueCount === 0
            ? "No other tokens resolve to this value across the loaded sets."
            : `${duplicateValueCount} other token${
                duplicateValueCount === 1 ? "" : "s"
              } resolve to the same value across loaded sets.`}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function walkAndCount(
  node: unknown,
  path: string,
  visit: (path: string, token: { $value: DtcgValue; $type?: DtcgType }) => void
) {
  if (!node || typeof node !== "object") return;
  if ("$value" in (node as Record<string, unknown>)) {
    visit(path, node as { $value: DtcgValue; $type?: DtcgType });
    return;
  }
  for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith("$")) continue;
    walkAndCount(child, path ? `${path}.${key}` : key, visit);
  }
}
