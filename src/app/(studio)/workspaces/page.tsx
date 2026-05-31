import { listWorkspaceSwitcherOptions } from "@/lib/auth/workspace-context";
import { WorkspacesPage } from "@/components/workspaces/workspaces-page";

export default async function WorkspacesRoute() {
  const initial = await listWorkspaceSwitcherOptions();
  return <WorkspacesPage initialWorkspaces={initial} />;
}
