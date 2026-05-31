"use client";

import { useCallback, useState, type DragEvent } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileJsonIcon,
  FolderOpenIcon,
  UploadCloudIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { parseTokenFile } from "@/lib/dtcg/schema";
import type { DtcgGroup } from "@/lib/dtcg/types";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { cn } from "@/lib/utils";

interface UploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedFile {
  name: string;
  /** Raw text content, kept around so a re-import after fixing config works. */
  text: string;
  /** Successful parse → root group. Failed parse → undefined + `error`. */
  root?: DtcgGroup;
  error?: string;
  /** Number of leaf tokens in the parsed tree. */
  tokenCount?: number;
  /** "new" or `replace:<setId>`; defaults to a fresh set. */
  destination: string;
}

export function UploadSheet({ open, onOpenChange }: UploadSheetProps) {
  const sets = useTokensStore((s) => s.sets);
  const importSet = useTokensStore((s) => s.importSet);

  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setFiles([]);
    setDragOver(false);
  }, []);

  const handleFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) =>
      f.name.toLowerCase().endsWith(".json")
    );
    if (list.length === 0) {
      toast.error("Drop a .json file");
      return;
    }
    const parsed = await Promise.all(
      list.map(async (f): Promise<ParsedFile> => {
        const text = await f.text();
        const result = parseTokenFile(text);
        if (!result.ok) {
          return { name: f.name, text, error: result.error, destination: "new" };
        }
        return {
          name: f.name,
          text,
          root: result.data as DtcgGroup,
          tokenCount: countTokens(result.data as DtcgGroup),
          destination: "new",
        };
      })
    );
    setFiles((prev) => [...prev, ...parsed]);
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onPickFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        await handleFiles(e.target.files);
        // Reset so picking the same file twice still triggers onChange.
        e.target.value = "";
      }
    },
    [handleFiles]
  );

  /**
   * Commits every successfully-parsed file to the store. Each row owns its
   * destination: fresh set by default, or explicit replacement when chosen.
   */
  const onConfirm = useCallback(() => {
    const valid = files.filter((f) => f.root);
    if (valid.length === 0) return;
    let lastId = "";
    let imported = 0;
    let replaced = 0;
    for (const f of valid) {
      const baseName = f.name.replace(/\.tokens\.json$|\.json$/i, "");
      const replaceId = f.destination.startsWith("replace:")
        ? f.destination.slice("replace:".length)
        : undefined;
      const targetExists = replaceId
        ? sets.some((s) => s.id === replaceId)
        : false;
      lastId = importSet(
        baseName.charAt(0).toUpperCase() + baseName.slice(1),
        f.root!,
        { replaceId: targetExists ? replaceId : undefined }
      );
      if (targetExists) replaced++;
      else imported++;
    }
    toast.success(
      [
        imported > 0 && `Imported ${imported} new ${imported === 1 ? "set" : "sets"}`,
        replaced > 0 && `Replaced ${replaced}`,
      ]
        .filter(Boolean)
        .join(" • "),
      {
        description: "Don't forget to Save to persist these locally.",
      }
    );
    reset();
    onOpenChange(false);
    return lastId;
  }, [files, sets, importSet, reset, onOpenChange]);

  const validCount = files.filter((f) => f.root).length;
  const errorCount = files.length - validCount;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className={cn(
          "sm:max-w-xl!",
          "data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto",
          "flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
        )}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Upload tokens</SheetTitle>
          <SheetDescription>
            Drop a DTCG / W3C tokens JSON file, then choose whether each file
            creates a set or replaces an existing one.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <DropZone
            dragOver={dragOver}
            onDragOver={(e: DragEvent<HTMLLabelElement>) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPickFiles={onPickFiles}
          />

          {files.length > 0 && (
            <ul className="flex flex-col gap-2">
              {files.map((f, i) => (
                <FileEntry
                  key={`${f.name}-${i}`}
                  file={f}
                  sets={sets}
                  onDestinationChange={(destination) =>
                    setFiles((prev) =>
                      prev.map((entry, idx) =>
                        idx === i ? { ...entry, destination } : entry
                      )
                    )
                  }
                  onRemove={() =>
                    setFiles((prev) => prev.filter((_, idx) => idx !== i))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t bg-muted/30 px-6 py-3">
          <div className="flex flex-1 items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              {files.length === 0
                ? "No files yet"
                : `${validCount} valid${
                    errorCount > 0 ? ` • ${errorCount} with errors` : ""
                  }`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={validCount === 0}>
                Import {validCount > 0 ? validCount : ""}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface DropZoneProps {
  dragOver: boolean;
  onDragOver: (e: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLLabelElement>) => void;
  onPickFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function DropZone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFiles,
}: DropZoneProps) {
  return (
    <label
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "border-border bg-muted/30 hover:bg-muted/60 hover:border-border/80 group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragOver && "border-primary bg-primary/5"
      )}
    >
      <input
        type="file"
        accept=".json,application/json"
        multiple
        className="sr-only"
        onChange={onPickFiles}
      />
      <UploadCloudIcon
        className={cn(
          "text-muted-foreground size-9 transition-colors",
          dragOver && "text-primary"
        )}
      />
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm font-medium">
          {dragOver ? "Drop to upload" : "Drag & drop tokens.json here"}
        </span>
        <span className="text-muted-foreground text-xs">
          or click to browse — multi-file supported
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        // The label is the actual file picker; this button is purely
        // decorative but still focusable for keyboard users.
        tabIndex={-1}
        className="pointer-events-none"
      >
        <FolderOpenIcon />
        Choose file…
      </Button>
    </label>
  );
}

function FileEntry({
  file,
  sets,
  onDestinationChange,
  onRemove,
}: {
  file: ParsedFile;
  sets: Array<{ id: string; name: string }>;
  onDestinationChange: (destination: string) => void;
  onRemove: () => void;
}) {
  const ok = file.root !== undefined;
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        ok ? "border-border bg-background" : "border-destructive/40 bg-destructive/5"
      )}
    >
      <FileJsonIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{file.name}</span>
          {ok ? (
            <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircleIcon className="text-destructive size-3.5 shrink-0" />
          )}
        </div>
        {ok ? (
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-muted-foreground text-xs">
              {file.tokenCount} {file.tokenCount === 1 ? "token" : "tokens"}
            </span>
            <Select
              value={file.destination}
              onValueChange={(value) => {
                if (value) onDestinationChange(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-full min-w-0"
                aria-label={`Import destination for ${file.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value="new">Add as new set</SelectItem>
                {sets.map((set) => (
                  <SelectItem key={set.id} value={`replace:${set.id}`}>
                    Replace {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-destructive whitespace-pre-wrap text-xs">
            {file.error}
          </span>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

/**
 * Counts leaf tokens (nodes with `$value`) in a DTCG tree. Used purely
 * for UX feedback in the upload preview.
 */
function countTokens(root: DtcgGroup): number {
  let n = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if ("$value" in node) {
      n++;
      return;
    }
    for (const child of Object.values(node as Record<string, unknown>)) {
      walk(child);
    }
  };
  walk(root);
  return n;
}
