"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { checkAiProviderReadiness, saveAiSettings } from "@/lib/ai-os/actions";
import type { AiProviderConfig, AiSettings } from "@/lib/workspace/types";

interface AiProvidersPanelProps {
  initialSettings: AiSettings;
}

type LocalReadiness =
  | "ready"
  | "missing"
  | "unauthenticated"
  | "disabled-runtime"
  | "misconfigured"
  | "unknown";

interface ReadinessState {
  readiness: LocalReadiness;
  detail?: string;
  isChecking: boolean;
}

const LOCAL_KINDS = new Set(["claude-code-local", "codex-local"]);

const READINESS_LABELS: Record<LocalReadiness, string> = {
  ready: "Ready",
  missing: "Missing",
  unauthenticated: "Sign in required",
  "disabled-runtime": "Disabled in this runtime",
  misconfigured: "Misconfigured",
  unknown: "Unknown",
};

function getReadinessBadgeClass(readiness: LocalReadiness): string {
  switch (readiness) {
    case "ready":
      return "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "missing":
    case "unauthenticated":
      return "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "misconfigured":
      return "border-transparent bg-destructive/15 text-destructive";
    case "disabled-runtime":
    case "unknown":
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

/**
 * AI Providers panel — the previous `studio-settings.tsx` "AI Providers" tab
 * extracted into a focused panel. Behavior is unchanged: API keys are write-
 * only (`getAiSettings` redacts them), saving submits the entire `AiSettings`
 * object through `saveAiSettings`, and the deterministic provider is always
 * present as a no-key fallback.
 */
export function AiProvidersPanel({ initialSettings }: AiProvidersPanelProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [executablePaths, setExecutablePaths] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<Record<string, ReadinessState>>({});
  const [isPending, startTransition] = useTransition();

  const localProviders = settings.providers.filter((provider) => LOCAL_KINDS.has(provider.kind));
  const apiKeyProviders = settings.providers.filter((provider) => !LOCAL_KINDS.has(provider.kind));

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      for (const provider of localProviders) {
        if (readiness[provider.id]) continue;
        setReadiness((current) => ({
          ...current,
          [provider.id]: { readiness: "unknown", isChecking: true },
        }));
        const result = await checkAiProviderReadiness(provider.id);
        if (cancelled) return;
        setReadiness((current) => ({
          ...current,
          [provider.id]: result.ok
            ? { readiness: result.readiness, detail: result.detail, isChecking: false }
            : { readiness: "misconfigured", detail: result.error, isChecking: false },
        }));
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.providers.map((p) => p.id).join("|")]);

  function updateProvider(id: string, patch: Partial<AiProviderConfig>) {
    setSettings((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function handleTestConnection(providerId: string) {
    setReadiness((current) => ({
      ...current,
      [providerId]: {
        readiness: current[providerId]?.readiness ?? "unknown",
        detail: current[providerId]?.detail,
        isChecking: true,
      },
    }));
    const result = await checkAiProviderReadiness(providerId);
    setReadiness((current) => ({
      ...current,
      [providerId]: result.ok
        ? { readiness: result.readiness, detail: result.detail, isChecking: false }
        : { readiness: "misconfigured", detail: result.error, isChecking: false },
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const next: AiSettings = {
        ...settings,
        providers: settings.providers.map((provider) => {
          const base: AiProviderConfig = {
            ...provider,
            apiKey: provider.id in apiKeys ? apiKeys[provider.id]!.trim() : undefined,
          };
          if (LOCAL_KINDS.has(provider.kind)) {
            base.executablePath =
              provider.id in executablePaths
                ? executablePaths[provider.id]!.trim() || undefined
                : provider.executablePath;
          }
          return base;
        }),
      };
      const result = await saveAiSettings(next);
      if (!result.ok) {
        toast.error("Could not save AI settings", { description: result.error });
        return;
      }
      setSettings(result.settings);
      setApiKeys({});
      setExecutablePaths({});
      toast.success("AI settings saved");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-sm font-medium">AI providers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure provider/model/API key choices for AI-driven workflows. Keys are stored locally in
            <code className="ml-1 rounded bg-muted px-1 text-[0.65rem]">.rozetta/ai-settings.local.json</code>
            and never committed to Git.
          </p>
        </div>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? <LoaderCircleIcon className="animate-spin" /> : <CheckCircle2Icon />}
          Save providers
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {apiKeyProviders.map((provider) => (
          <div
            key={provider.id}
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <KeyRoundIcon className="size-4 text-muted-foreground" />
                  {provider.label}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{provider.model.id}</p>
              </div>
              <Badge variant={provider.hasApiKey ? "default" : "outline"}>
                {provider.kind === "deterministic"
                  ? "fallback"
                  : provider.hasApiKey
                    ? "key set"
                    : "no key"}
              </Badge>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={settings.activeProviderId === provider.id}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setSettings((current) => ({
                      ...current,
                      activeProviderId: provider.id,
                      updatedAt: new Date().toISOString(),
                    }));
                  }
                }}
              />
              Active provider
            </label>

            {provider.kind !== "deterministic" ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={provider.enabled}
                    onCheckedChange={(checked) =>
                      updateProvider(provider.id, { enabled: checked === true })
                    }
                  />
                  Enabled
                </label>
                <Input
                  value={provider.model.id}
                  onChange={(event) =>
                    updateProvider(provider.id, {
                      model: {
                        id: event.target.value,
                        label: event.target.value,
                      },
                    })
                  }
                  aria-label={`${provider.label} model`}
                  placeholder="Model id"
                />
                <Input
                  type="password"
                  value={apiKeys[provider.id] ?? ""}
                  onChange={(event) =>
                    setApiKeys((current) => ({
                      ...current,
                      [provider.id]: event.target.value,
                    }))
                  }
                  placeholder={provider.hasApiKey ? "Keep existing key" : "API key"}
                  aria-label={`${provider.label} API key`}
                />
                <Input
                  value={provider.baseUrl ?? ""}
                  onChange={(event) =>
                    updateProvider(provider.id, {
                      baseUrl: event.target.value || undefined,
                    })
                  }
                  placeholder="Custom base URL"
                  aria-label={`${provider.label} base URL`}
                />
              </>
            ) : null}
          </div>
        ))}
      </div>

      {localProviders.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Local providers</h2>
            <p className="text-xs text-muted-foreground">
              Local providers run the Claude Code / Codex CLI on your machine. Make sure the CLI is
              installed and authenticated outside Rozetta.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {localProviders.map((provider) => {
              const state = readiness[provider.id];
              const currentReadiness: LocalReadiness = state?.readiness ?? "unknown";
              const isChecking = Boolean(state?.isChecking);
              const isHosted = currentReadiness === "disabled-runtime";
              const pathValue =
                provider.id in executablePaths
                  ? executablePaths[provider.id]!
                  : (provider.executablePath ?? "");
              return (
                <div
                  key={provider.id}
                  className="flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <TerminalIcon className="size-4 text-muted-foreground" />
                        {provider.label}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.model.id}</p>
                    </div>
                    <Badge className={getReadinessBadgeClass(currentReadiness)}>
                      {isChecking ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : null}
                      {READINESS_LABELS[currentReadiness]}
                    </Badge>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={settings.activeProviderId === provider.id}
                      disabled={isHosted}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          setSettings((current) => ({
                            ...current,
                            activeProviderId: provider.id,
                            updatedAt: new Date().toISOString(),
                          }));
                        }
                      }}
                    />
                    Active provider
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={provider.enabled}
                      disabled={isHosted}
                      onCheckedChange={(checked) =>
                        updateProvider(provider.id, { enabled: checked === true })
                      }
                    />
                    Enabled
                  </label>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${provider.id}-executable-path`}
                      className="text-xs text-muted-foreground"
                    >
                      Executable path (optional)
                    </label>
                    <Input
                      id={`${provider.id}-executable-path`}
                      value={pathValue}
                      disabled={isHosted}
                      onChange={(event) =>
                        setExecutablePaths((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                      placeholder={
                        provider.kind === "claude-code-local"
                          ? "/usr/local/bin/claude"
                          : "/usr/local/bin/codex"
                      }
                      aria-label={`${provider.label} executable path`}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleTestConnection(provider.id)}
                      disabled={isChecking || isHosted}
                    >
                      {isChecking ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : null}
                      Test connection
                    </Button>
                    {state?.detail ? (
                      <span className="truncate text-xs text-muted-foreground" title={state.detail}>
                        {state.detail}
                      </span>
                    ) : null}
                  </div>

                  {isHosted ? (
                    <p className="text-xs text-muted-foreground">
                      Local providers run only on your own machine.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
