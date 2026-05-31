import { SettingsPage } from "@/components/settings/settings-page";
import { getSettingsOverview } from "@/lib/settings/actions";

export default async function SettingsRoute() {
  const overview = await getSettingsOverview();
  return <SettingsPage overview={overview} />;
}
