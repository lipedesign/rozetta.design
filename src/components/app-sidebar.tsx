"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  ArrowRightLeftIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PaletteIcon,
  GitBranchIcon,
  TagIcon,
  DownloadIcon,
  UploadIcon,
  SparklesIcon,
  ShapesIcon,
  BotIcon,
  PlugZapIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  FolderIcon,
  LoaderCircleIcon,
  SaveIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ALL_SETS_ID, useTokensStore } from "@/lib/stores/tokens-store"
import { useThemesStore } from "@/lib/themes/store"
import { saveWorkspaceArtifacts } from "@/lib/tokens/actions"
import { switchWorkspace } from "@/lib/auth/actions"
import type {
  AuthUserProfile,
  WorkspaceContext,
  WorkspaceSwitcherOption,
} from "@/lib/auth/types"
import type { WorkspaceBranch } from "@/lib/branches/types"
import { runBranchSwitch } from "@/lib/branches/switch-state"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /**
   * Called when the user activates the secondary "Export" / "Upload" items.
   * The sidebar itself doesn't own these sheets — `StudioShell` keeps the
   * open/close state next to the rest of the app's overlays.
   */
  onOpenExport?: () => void
  onOpenUpload?: () => void
  onOpenAi?: () => void
  userProfile?: AuthUserProfile
  workspaceContext?: WorkspaceContext
  workspaceOptions?: WorkspaceSwitcherOption[]
  activeWorkspaceBranch?: WorkspaceBranch
  workspaceBranches?: WorkspaceBranch[]
}

export function AppSidebar({
  onOpenExport,
  onOpenUpload,
  onOpenAi,
  userProfile,
  workspaceContext,
  workspaceOptions = [],
  activeWorkspaceBranch,
  workspaceBranches = [],
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const selectSet = useTokensStore((s) => s.selectSet)
  const sets = useTokensStore((s) => s.sets)
  const originals = useTokensStore((s) => s.originals)
  const saveAllLocal = useTokensStore((s) => s.saveAll)
  const discardAll = useTokensStore((s) => s.discardAll)
  const hydrateTokens = useTokensStore((s) => s.hydrate)
  const themes = useThemesStore((s) => s.themes)
  const themeOriginals = useThemesStore((s) => s.originals)
  const saveAllThemes = useThemesStore((s) => s.saveAll)
  const hydrateThemes = useThemesStore((s) => s.hydrate)
  const setThemeGroups = useThemesStore((s) => s.setThemeGroups)
  const discardAllThemes = useThemesStore((s) => s.discardAll)
  const [saving, setSaving] = React.useState(false)
  const syncActive = pathname === "/sync" || pathname.startsWith("/sync/")
  const activeWorkspace =
    workspaceOptions.find((option) => option.isActive) ?? workspaceOptions[0]
  const account = {
    name: userProfile?.name ?? "User",
    email: userProfile?.email ?? "dev@rozetta.local",
    avatar: userProfile?.avatarUrl,
    plan: titleCase(userProfile?.plan ?? "Free"),
  }

  const dirtyTokenCount = sets.reduce((acc, set) => {
    const original = originals[set.id]
    if (!original) return acc + 1
    return JSON.stringify(set.root) !== JSON.stringify(original) ? acc + 1 : acc
  }, 0)
  const themeIds = new Set([
    ...themes.map((theme) => theme.id),
    ...themeOriginals.map((theme) => theme.id),
  ])
  const dirtyThemeCount = Array.from(themeIds).reduce((acc, id) => {
    const current = themes.find((theme) => theme.id === id)
    const original = themeOriginals.find((theme) => theme.id === id)
    if (!current || !original) return acc + 1
    return JSON.stringify(current) !== JSON.stringify(original) ? acc + 1 : acc
  }, 0)
  const dirtyCount = dirtyTokenCount + dirtyThemeCount
  const isDirty = dirtyCount > 0

  const navActionItems = [
    {
      title: "Quick Export",
      url: "#export",
      icon: <DownloadIcon />,
      onClick: onOpenExport,
    },
    {
      title: "Import Tokens",
      url: "#upload",
      icon: <UploadIcon />,
      onClick: onOpenUpload,
    },
    {
      title: "Ask AI",
      url: "#ai",
      icon: <SparklesIcon />,
      onClick: onOpenAi,
    },
  ]

  const navCommandItems = [
    {
      title: "AI",
      url: "/ai",
      icon: <BotIcon />,
      isActive: pathname === "/ai",
    },
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
      isActive: pathname === "/dashboard",
    },
  ]

  const navDesignSystemItems = [
    {
      title: "Tokens",
      url: "/",
      icon: <LayersIcon />,
      isActive: pathname === "/",
      onClick: pathname === "/" ? () => selectSet(ALL_SETS_ID) : undefined,
    },
    {
      title: "Themes",
      url: "/themes",
      icon: <PaletteIcon />,
      isActive: pathname === "/themes",
    },
    {
      title: "Components",
      url: "/components",
      icon: <ShapesIcon />,
      isActive: pathname === "/components",
    },
  ]

  const navWorkflowItems = [
    {
      title: "Branches",
      url: "/branches",
      icon: <GitBranchIcon />,
      isActive: pathname === "/branches",
    },
    {
      title: "Releases",
      url: "/releases",
      icon: <TagIcon />,
      isActive: pathname === "/releases",
    },
    {
      title: "Sync Hub",
      url: "/sync",
      icon: <PlugZapIcon />,
      isActive: syncActive,
    },
    {
      title: "Exports",
      url: "/exports",
      icon: <DownloadIcon />,
      isActive: pathname === "/exports",
    },
  ]

  async function handleSaveAll() {
    if (saving) return
    setSaving(true)
    try {
      const result = await saveWorkspaceArtifacts()
      if (!result.ok) {
        toast.error("Save failed", { description: result.error })
        return
      }
      const count = saveAllLocal() + saveAllThemes()
      toast.success(`Saved ${count} ${count === 1 ? "change" : "changes"}`, {
        description: "Workspace exported to Git-native files.",
      })
    } catch (err) {
      console.error("[save]", err)
      toast.error("Save failed", { description: "Workspace artifacts were not exported." })
    } finally {
      setSaving(false)
    }
  }

  function handleDiscardAll() {
    const count = discardAll() + discardAllThemes()
    if (count > 0) {
      toast.success(`Discarded ${count} ${count === 1 ? "change" : "changes"}`)
    }
  }

  return (
    <Sidebar
      variant="floating"
      /**
       * Make the floating sidebar visually transparent so the page's
       * `--muted` background shows through. We then locally override
       * `--sidebar-accent` because the default value (`oklch(0.97)`) is
       * identical to `--muted`, which would make hover/active states
       * invisible against the see-through panel.
       */
      className="*:data-[slot=sidebar-inner]:bg-transparent *:data-[slot=sidebar-inner]:shadow-none *:data-[slot=sidebar-inner]:ring-0 [--sidebar-accent:oklch(0.92_0_0)] dark:[--sidebar-accent:oklch(0.32_0_0)]"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <SparklesIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {activeWorkspace?.name ?? "My workspace"}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {activeWorkspaceBranch ? (
                      <>
                        <GitBranchIcon className="size-3 shrink-0" />
                        <span className="truncate font-mono">
                          {activeWorkspaceBranch.name}
                        </span>
                      </>
                    ) : (
                      <span className="truncate">
                        {activeWorkspace?.organizationName ?? "Rozetta"}
                      </span>
                    )}
                  </span>
                </div>
                {isDirty && <span className="bg-amber-500 size-1.5 rounded-full" />}
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-64" side="right" align="start" sideOffset={6}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                        <FolderIcon className="size-4" />
                      </div>
                      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {activeWorkspace?.name ?? "My workspace"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {workspaceContext?.role ?? "owner"} · {isDirty ? `${dirtyCount} unsaved` : "saved"}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={!isDirty || saving} onClick={handleSaveAll}>
                    {saving ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
                    {saving ? "Saving..." : "Save all changes"}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!isDirty || saving} variant="destructive" onClick={handleDiscardAll}>
                    <Undo2Icon />
                    Discard all changes
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {workspaceBranches.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                        Branch
                      </DropdownMenuLabel>
                      {workspaceBranches.map((branch) => {
                        const isActiveBranch = branch.id === activeWorkspaceBranch?.id
                        return (
                          <DropdownMenuItem
                            key={branch.id}
                            disabled={isActiveBranch}
                            onClick={async () => {
                              const result = await runBranchSwitch(branch.id, branch.name)
                              if (!result.ok) {
                                toast.error("Couldn't switch branch", { description: result.error })
                                return
                              }
                              hydrateTokens(result.snapshot.sets)
                              hydrateThemes(result.snapshot.themes)
                              setThemeGroups(result.snapshot.themeGroups)
                              router.refresh()
                              toast.success(`On branch "${result.branch.name}"`)
                            }}
                          >
                            <GitBranchIcon />
                            <span className="truncate font-mono">{branch.name}</span>
                            {isActiveBranch ? (
                              <CheckIcon className="ml-auto" />
                            ) : (
                              <ArrowRightLeftIcon className="ml-auto size-3.5 text-muted-foreground" />
                            )}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuGroup>
                  </>
                )}
                {workspaceOptions.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                        Workspace
                      </DropdownMenuLabel>
                      {workspaceOptions.map((option) => (
                        <form key={option.id} action={switchWorkspace}>
                          <input type="hidden" name="workspaceId" value={option.id} />
                          <DropdownMenuItem render={<button type="submit" className="w-full" />}>
                            <FolderIcon />
                            <span className="truncate">{option.name}</span>
                            {option.isActive && <CheckIcon className="ml-auto" />}
                          </DropdownMenuItem>
                        </form>
                      ))}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navCommandItems} label="COMMAND" />
        <NavMain items={navDesignSystemItems} label="DESIGN SYSTEM" />
        <NavMain items={navWorkflowItems} label="WORKFLOW" />
        <NavSecondary items={navActionItems} label="ACTIONS" className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={account} />
      </SidebarFooter>
    </Sidebar>
  )
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
