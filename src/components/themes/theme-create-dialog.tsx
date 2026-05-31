"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useThemesStore } from "@/lib/themes/store";

interface ThemeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, prefills and updates the given theme instead of creating. */
  editId?: string;
}

export function ThemeCreateDialog({
  open,
  onOpenChange,
  editId,
}: ThemeCreateDialogProps) {
  const themes = useThemesStore((s) => s.themes);
  const createTheme = useThemesStore((s) => s.createTheme);
  const updateTheme = useThemesStore((s) => s.updateTheme);

  const existing = editId ? themes.find((t) => t.id === editId) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(
    existing?.description ?? ""
  );

  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setDescription("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editId) {
      updateTheme(editId, {
        name: trimmed,
        description: description.trim() || undefined,
      });
    } else {
      createTheme(trimmed, description.trim() || undefined);
    }
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit theme" : "New theme"}</DialogTitle>
          <DialogDescription>
            {editId
              ? "Update the theme's name and description."
              : "Create a new token theme. You'll add collections and modes to it next."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="py-2">
            <Field>
              <FieldLabel htmlFor="theme-name">Name *</FieldLabel>
              <Input
                id="theme-name"
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Brand Light"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="theme-desc">Description</FieldLabel>
              <Textarea
                id="theme-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Light mode brand palette"
                rows={2}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {editId ? "Save" : "Create theme"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
