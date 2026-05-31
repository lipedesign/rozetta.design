import { boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  plan: text("plan").notNull().default("free"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("profiles_email_unique").on(table.email),
]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("organizations_slug_unique").on(table.slug),
]);

export const organizationMembers = pgTable("organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("organization_members_org_user_unique").on(table.organizationId, table.userId),
  index("organization_members_user_idx").on(table.userId),
]);

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  activeBranchId: text("active_branch_id"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workspaces_organization_slug_unique").on(table.organizationId, table.slug),
]);

export const workspaceBranches = pgTable(
  "workspace_branches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    parentBranchId: text("parent_branch_id"),
    snapshot: text("snapshot").notNull(),
    gitBinding: text("git_binding"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workspace_branches_workspace_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("workspace_branches_workspace_name_unique").on(table.workspaceId, table.name),
  ]
);

export const workspaceMemberships = pgTable("workspace_memberships", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workspace_memberships_workspace_user_unique").on(table.workspaceId, table.userId),
  index("workspace_memberships_user_idx").on(table.userId),
]);

export const tokenSets = pgTable(
  "token_sets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filename: text("filename").notNull(),
    root: text("root").notNull(),
    modes: text("modes"),
    modeRoots: text("mode_roots"),
    activeModeId: text("active_mode_id"),
    source: text("source").notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("token_sets_workspace_name_idx").on(table.workspaceId, table.name),
    uniqueIndex("token_sets_workspace_filename_unique").on(table.workspaceId, table.filename),
  ]
);

export const tokenIndex = pgTable(
  "token_index",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    setId: text("set_id")
      .notNull()
      .references(() => tokenSets.id, { onDelete: "cascade" }),
    modeId: text("mode_id").notNull().default("default"),
    path: text("path").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    value: text("value").notNull(),
    description: text("description"),
    isAlias: boolean("is_alias").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("token_index_set_mode_path_unique").on(table.setId, table.modeId, table.path),
    index("token_index_workspace_path_idx").on(table.workspaceId, table.path),
    index("token_index_workspace_type_idx").on(table.workspaceId, table.type),
  ]
);

export const themes = pgTable(
  "themes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    themeGroupId: text("theme_group_id"),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("themes_workspace_name_idx").on(table.workspaceId, table.name),
    index("themes_group_position_idx").on(table.themeGroupId, table.position),
  ]
);

export const themeSets = pgTable(
  "theme_sets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    setId: text("set_id").notNull(),
    modeId: text("mode_id").notNull().default("default"),
    mode: text("mode").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("theme_sets_theme_set_mode_unique").on(table.themeId, table.setId, table.modeId),
    index("theme_sets_theme_position_idx").on(table.themeId, table.position),
  ]
);

export const artifactExports = pgTable(
  "artifact_exports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: text("target_id"),
    path: text("path").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("artifact_exports_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull().default("system"),
    actorId: text("actor_id"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_events_workspace_kind_created_idx").on(table.workspaceId, table.kind, table.createdAt),
  ]
);

export const figmaFiles = pgTable(
  "figma_files",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("figma_files_workspace_file_key_unique").on(table.workspaceId, table.fileKey),
  ]
);

export const figmaSnapshots = pgTable(
  "figma_snapshots",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => figmaFiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull(),
    checksum: text("checksum").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("figma_snapshots_file_created_idx").on(table.fileId, table.createdAt),
  ]
);

export const figmaVariableBindings = pgTable(
  "figma_variable_bindings",
  {
    id: text("id").primaryKey(),
    figmaFileId: text("figma_file_id")
      .notNull()
      .references(() => figmaFiles.id, { onDelete: "cascade" }),
    variableId: text("variable_id").notNull(),
    collectionId: text("collection_id").notNull(),
    modeId: text("mode_id"),
    setId: text("set_id").notNull(),
    tokenPath: text("token_path").notNull(),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (table) => [
    uniqueIndex("figma_variable_bindings_unique_variable_mode").on(
      table.figmaFileId,
      table.variableId,
      table.modeId
    ),
    index("figma_variable_bindings_token_idx").on(table.setId, table.tokenPath),
  ]
);

export const themeGroups = pgTable(
  "theme_groups",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("theme_groups_workspace_position_idx").on(
      table.workspaceId,
      table.position
    ),
  ]
);

export const figmaWritebackDrafts = pgTable(
  "figma_writeback_drafts",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: text("payload").notNull(),
    syncRunId: text("sync_run_id"),
    deliveredSeq: integer("delivered_seq").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  }
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    direction: text("direction").notNull(),
    status: text("status").notNull(),
    sourceSnapshotId: text("source_snapshot_id").references(() => figmaSnapshots.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("sync_runs_workspace_connector_created_idx").on(
      table.workspaceId,
      table.connectorId,
      table.createdAt
    ),
  ]
);

export const syncOperations = pgTable(
  "sync_operations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    summary: text("summary").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("sync_operations_run_idx").on(table.runId)]
);

export const aiContextEvents = pgTable(
  "ai_context_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sourceId: text("source_id"),
    summary: text("summary").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("ai_context_events_workspace_kind_created_idx").on(
      table.workspaceId,
      table.kind,
      table.createdAt
    ),
  ]
);

export const githubPrDrafts = pgTable(
  "github_pr_drafts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    branchName: text("branch_name").notNull(),
    baseBranch: text("base_branch").notNull(),
    headBranch: text("head_branch").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull(),
    url: text("url"),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("github_pr_drafts_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
  ]
);

export type FigmaFileRow = typeof figmaFiles.$inferSelect;
export type FigmaSnapshotRow = typeof figmaSnapshots.$inferSelect;
export type FigmaVariableBindingRow = typeof figmaVariableBindings.$inferSelect;
export type FigmaWritebackDraftRow = typeof figmaWritebackDrafts.$inferSelect;
export type ThemeGroupRow = typeof themeGroups.$inferSelect;
export type WorkspaceBranchRow = typeof workspaceBranches.$inferSelect;
export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncOperationRow = typeof syncOperations.$inferSelect;
export type AiContextEventRow = typeof aiContextEvents.$inferSelect;
export type GitHubPrDraftRow = typeof githubPrDrafts.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type TokenSetRow = typeof tokenSets.$inferSelect;
export type TokenIndexRow = typeof tokenIndex.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type ThemeSetRow = typeof themeSets.$inferSelect;
export type ArtifactExportRow = typeof artifactExports.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;
export type WorkspaceMembershipRow = typeof workspaceMemberships.$inferSelect;
