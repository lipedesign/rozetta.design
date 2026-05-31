import { ProductShell } from "@/components/product-shell";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getProductShellData } from "@/lib/app-shell/data";
import { BadgeCheckIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BrandsRoute() {
  const shell = await getProductShellData();

  return (
    <ProductShell {...shell}>
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
              Brand packages are paused while Rozetta focuses on Collections, Modes, Components, and Figma sync.
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 p-6">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BadgeCheckIcon />
              </EmptyMedia>
              <EmptyTitle>Brands are paused</EmptyTitle>
              <EmptyDescription>
                Existing brand contracts and files stay compatible, but the product UI is hidden until the white-label workflow is redesigned.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-muted-foreground">
                Continue using Components, Themes, Exports, and Sync Hub for the active Design System workflow.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    </ProductShell>
  );
}
