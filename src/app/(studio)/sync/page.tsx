import { SyncHubPage } from "@/components/sync/sync-hub-page";
import { listSyncConnectors } from "@/lib/ai-os/registry";

export default function SyncRoute() {
  return <SyncHubPage connectors={listSyncConnectors()} />;
}
