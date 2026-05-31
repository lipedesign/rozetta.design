"use client";

import { Badge } from "@/components/ui/badge";
import type { SettingsRuntimeInfo, SettingsStorageStatus } from "@/lib/settings/types";

interface StorageSettingsPanelProps {
  storage: SettingsStorageStatus;
  runtime: SettingsRuntimeInfo;
}

/**
 * Storage panel — read-only summary of the runtime DB driver, configured-ness,
 * and the canonical Git artifact path. The DATABASE_URL is redacted server-
 * side before reaching this component.
 */
export function StorageSettingsPanel({ storage, runtime }: StorageSettingsPanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Runtime database</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Token Collections, Modes, and Themes live in the runtime database. Git JSON files are export artifacts.
          </p>
        </div>
        <div className="flex flex-col">
          <InfoRow label="Driver">
            <Badge variant="outline">{storage.driver}</Badge>
          </InfoRow>
          <InfoRow label="Status">
            <Badge variant={storage.databaseConfigured ? "default" : "outline"}>
              {storage.databaseConfigured ? "configured" : "not configured"}
            </Badge>
          </InfoRow>
          <InfoRow label="Connection" value={storage.databaseLabel} mono />
          <InfoRow label="Next runtime">
            <Badge variant="outline">{runtime.nextRuntime}</Badge>
          </InfoRow>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Artifact export</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Save and reviewed PR pipelines serialize workspace state into Git-native artifacts at this path.
          </p>
        </div>
        <div className="flex flex-col">
          <InfoRow label="Token artifact path" value={storage.artifactPath} mono />
          <InfoRow label="Themes artifact" value=".rozetta/themes.json" mono />
          <InfoRow label="AI settings" value=".rozetta/ai-settings.local.json (local-only)" mono />
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {children ?? (
        <span
          className={
            mono
              ? "truncate font-mono text-xs"
              : "truncate font-medium"
          }
        >
          {value}
        </span>
      )}
    </div>
  );
}
