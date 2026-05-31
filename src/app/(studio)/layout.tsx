import type { ReactNode } from "react";

import { ProductShell } from "@/components/product-shell";
import { getStudioShellData } from "@/lib/app-shell/data";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const shell = await getStudioShellData();

  return <ProductShell {...shell}>{children}</ProductShell>;
}
