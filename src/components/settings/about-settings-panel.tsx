"use client";

import { Badge } from "@/components/ui/badge";
import type { SettingsAboutLink, SettingsRuntimeInfo } from "@/lib/settings/types";

interface AboutSettingsPanelProps {
  runtime: SettingsRuntimeInfo;
  links: SettingsAboutLink[];
}

/**
 * About panel — version, runtime info, and outbound spec links. Read-only.
 */
export function AboutSettingsPanel({ runtime, links }: AboutSettingsPanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Rozetta</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            App version and runtime details for the currently-loaded build.
          </p>
        </div>
        <div className="flex flex-col">
          <InfoRow label="App version">
            <Badge variant="outline">v{runtime.appVersion}</Badge>
          </InfoRow>
          <InfoRow label="Node version" value={runtime.nodeVersion} mono />
          <InfoRow label="Next runtime">
            <Badge variant="outline">{runtime.nextRuntime}</Badge>
          </InfoRow>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Specs</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Specification-Driven Development — the live specs are the source of truth.
          </p>
        </div>
        <ul className="flex flex-col">
          {links.map((link) => (
            <li
              key={link.href}
              className="flex items-center justify-between gap-4 border-b py-2.5 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground">{link.label}</span>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate font-medium underline underline-offset-4"
              >
                {link.href.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
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
