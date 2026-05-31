"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  BadgeCheckIcon,
  CopyIcon,
  LayersIcon,
  PaletteIcon,
  PlusIcon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { resolveBrandPackage } from "@/lib/design-system/registry";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import type { Brand, BrandStatus, ExportProfile } from "@/lib/workspace/types";

interface BrandsPageProps {
  exportProfiles: ExportProfile[];
}

const BRAND_STATUSES: BrandStatus[] = ["draft", "active", "deprecated"];

export function BrandsPage({ exportProfiles }: BrandsPageProps) {
  const sets = useTokensStore((state) => state.sets);
  const themes = useThemesStore((state) => state.themes);
  const brands = useDesignSystemStore((state) => state.brands);
  const components = useDesignSystemStore((state) => state.components);
  const activeBrandId = useDesignSystemStore((state) => state.activeBrandId);
  const createBrand = useDesignSystemStore((state) => state.createBrand);
  const selectBrand = useDesignSystemStore((state) => state.selectBrand);
  const duplicateBrand = useDesignSystemStore((state) => state.duplicateBrand);
  const deleteBrand = useDesignSystemStore((state) => state.deleteBrand);

  const [newName, setNewName] = useState("");
  const [newBaseBrandId, setNewBaseBrandId] = useState("none");
  const activeBrand = brands.find((brand) => brand.id === activeBrandId) ?? brands[0] ?? null;
  const packageResult = useMemo(
    () =>
      activeBrand
        ? resolveBrandPackage(activeBrand.id, {
            sets,
            themes,
            exportProfiles,
            brands,
            components,
          })
        : undefined,
    [activeBrand, brands, components, exportProfiles, sets, themes]
  );

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createBrand(name, newBaseBrandId === "none" ? undefined : newBaseBrandId);
    setNewName("");
    setNewBaseBrandId("none");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BadgeCheckIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              White label
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compose collections, themes, exports, and components into Git-versioned brand packages.
          </p>
        </div>
        <Badge variant="secondary">{brands.length} brands</Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="grid xl:grid-cols-[22rem_1fr]">
          <section className="flex min-w-0 flex-col border-b xl:border-r xl:border-b-0">
            <Block title="Create brand" description="Base brand is optional." className="border-b">
              <div className="flex flex-col gap-3">
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Acme Banking"
                  aria-label="Brand name"
                />
                <Select value={newBaseBrandId} onValueChange={(value) => setNewBaseBrandId(value ?? "none")}>
                  <SelectTrigger className="w-full" aria-label="Base brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="none">No base brand</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={handleCreate} disabled={!newName.trim()}>
                  <PlusIcon />
                  Add brand
                </Button>
              </div>
            </Block>

            <Block title="Registry" description="Stored in `.rozetta/brands.json`.">
              {brands.length === 0 ? (
                <EmptyLine>Create a brand package to start white label management.</EmptyLine>
              ) : (
                <div className="flex flex-col">
                  {brands.map((brand) => (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => selectBrand(brand.id)}
                      className="flex items-center justify-between gap-3 border-b py-2.5 text-left text-sm transition-colors last:border-b-0 hover:text-foreground data-[active=true]:font-medium"
                      data-active={brand.id === activeBrand?.id}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{brand.name}</span>
                        <span className="text-xs text-muted-foreground">{brand.slug}</span>
                      </span>
                      <Badge variant={brand.status === "active" ? "default" : "outline"}>
                        {brand.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </Block>
          </section>

          <section className="flex min-w-0 flex-col">
            {activeBrand ? (
              <>
                <BrandEditor
                  key={activeBrand.id}
                  brand={activeBrand}
                  brands={brands}
                  sets={sets.map((set) => ({ id: set.id, name: set.name }))}
                  themes={themes.map((theme) => ({ id: theme.id, name: theme.name }))}
                  exportProfiles={exportProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
                  components={components.map((component) => ({ id: component.id, name: component.name }))}
                  onDuplicate={() => duplicateBrand(activeBrand.id)}
                  onDelete={() => deleteBrand(activeBrand.id)}
                />
                <ResolvedPackage result={packageResult} />
              </>
            ) : (
              <div className="px-6 py-12">
                <h2 className="text-sm font-medium">No brand selected</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create or select a brand to edit its package.
                </p>
              </div>
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  );
}

function BrandEditor({
  brand,
  brands,
  sets,
  themes,
  exportProfiles,
  components,
  onDuplicate,
  onDelete,
}: {
  brand: Brand;
  brands: Brand[];
  sets: Array<{ id: string; name: string }>;
  themes: Array<{ id: string; name: string }>;
  exportProfiles: Array<{ id: string; name: string }>;
  components: Array<{ id: string; name: string }>;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const updateBrand = useDesignSystemStore((state) => state.updateBrand);
  const [draft, setDraft] = useState(brand);

  function save() {
    updateBrand(brand.id, draft);
  }

  return (
    <Block
      title={brand.name}
      description={brand.id}
      className="border-b"
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
            aria-label="Brand name"
          />
          <Input
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            aria-label="Brand slug"
          />
          <Textarea
            value={draft.description ?? ""}
            onChange={(event) => setDraft({ ...draft, description: event.target.value || undefined })}
            aria-label="Brand description"
            placeholder="Description"
          />
          <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value as BrandStatus })}>
            <SelectTrigger className="w-full" aria-label="Brand status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {BRAND_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.baseBrandId ?? "none"}
            onValueChange={(value) =>
              setDraft({ ...draft, baseBrandId: !value || value === "none" ? undefined : value })
            }
          >
            <SelectTrigger className="w-full" aria-label="Base brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="none">No base brand</SelectItem>
              {brands
                .filter((item) => item.id !== brand.id)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={save}>
            Save brand
          </Button>
        </div>

        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          <ReferenceGroup
            title="Collections"
            icon={<LayersIcon />}
            items={sets}
            selectedIds={draft.tokenSetIds}
            onChange={(tokenSetIds) => setDraft({ ...draft, tokenSetIds })}
          />
          <ReferenceGroup
            title="Themes"
            icon={<PaletteIcon />}
            items={themes}
            selectedIds={draft.themeIds}
            onChange={(themeIds) => setDraft({ ...draft, themeIds })}
          />
          <ReferenceGroup
            title="Exports"
            icon={<BadgeCheckIcon />}
            items={exportProfiles}
            selectedIds={draft.exportProfileIds}
            onChange={(exportProfileIds) => setDraft({ ...draft, exportProfileIds })}
          />
          <ReferenceGroup
            title="Components"
            icon={<ShapesIcon />}
            items={components}
            selectedIds={draft.componentIds}
            onChange={(componentIds) => setDraft({ ...draft, componentIds })}
          />
        </div>
      </div>
    </Block>
  );
}

function ReferenceGroup({
  title,
  icon,
  items,
  selectedIds,
  onChange,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="border-t pt-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items available.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-2 overflow-auto pr-1">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...selectedIds, item.id]
                    : selectedIds.filter((id) => id !== item.id);
                  onChange(Array.from(new Set(next)));
                }}
              />
              <span className="min-w-0 truncate">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ResolvedPackage({ result }: { result: ReturnType<typeof resolveBrandPackage> }) {
  if (!result) return null;
  const missingCount = Object.values(result.missing).reduce((count, ids) => count + ids.length, 0);

  return (
    <Block
      title="Resolved brand package"
      description={
        result.inheritedBrandIds.length > 0
          ? `Inherits ${result.inheritedBrandIds.join(", ")}`
          : "No base brand inheritance"
      }
      action={
        <Badge variant={missingCount > 0 || result.cycleDetected ? "destructive" : "secondary"}>
          {missingCount > 0 ? `${missingCount} missing` : result.cycleDetected ? "cycle" : "valid"}
        </Badge>
      }
    >
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <PackageMetric title="Sets" value={result.tokenSetIds.length} />
        <PackageMetric title="Themes" value={result.themeIds.length} />
        <PackageMetric title="Exports" value={result.exportProfileIds.length} />
        <PackageMetric title="Components" value={result.componentIds.length} />
      </div>
    </Block>
  );
}

function PackageMetric({ title, value }: { title: string; value: number }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
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
