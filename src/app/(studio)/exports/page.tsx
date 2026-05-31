import { ExportsPage } from "@/components/exports/exports-page";
import { getExportProfiles } from "@/lib/export-profiles/actions";

export default async function ExportsRoute() {
  const profiles = await getExportProfiles();

  return <ExportsPage initialProfiles={profiles.profiles} profilesFileExists={profiles.exists} />;
}
