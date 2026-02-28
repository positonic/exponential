import { db } from "~/server/db";

/**
 * Source of a resolved config value: project override, workspace default, or app default.
 */
export type ConfigSource = "project" | "workspace" | "app";

/**
 * A resolved config value with its source tracked for UI display.
 */
export interface ResolvedValue<T> {
  value: T;
  source: ConfigSource;
}

/**
 * The fully resolved Notion configuration for a project, with source tracking.
 */
export interface ResolvedNotionConfig {
  integrationId: ResolvedValue<string | null>;
  databaseId: ResolvedValue<string | null>;
  syncDirection: ResolvedValue<"pull" | "push" | "bidirectional">;
  syncFrequency: ResolvedValue<"manual" | "hourly" | "daily">;
  fieldMappings: ResolvedValue<Record<string, string>>;
}

/** App-level defaults used when neither project nor workspace provides a value. */
const APP_DEFAULTS: {
  syncDirection: "pull" | "push" | "bidirectional";
  syncFrequency: "manual" | "hourly" | "daily";
  fieldMappings: Record<string, string>;
} = {
  syncDirection: "pull",
  syncFrequency: "manual",
  fieldMappings: {},
};

/**
 * Shape of the project's taskManagementConfig JSON field (Notion-related keys).
 */
interface ProjectNotionConfig {
  integrationId?: string;
  databaseId?: string;
  syncDirection?: "pull" | "push" | "bidirectional";
  syncFrequency?: "manual" | "hourly" | "daily";
  fieldMappings?: Record<string, string>;
}

/**
 * Shape of the workspace's notionDefaultConfig JSON field.
 */
interface WorkspaceNotionConfig {
  defaultIntegrationId?: string;
  defaultDatabaseId?: string;
  syncDirection?: "pull" | "push" | "bidirectional";
  syncFrequency?: "manual" | "hourly" | "daily";
  fieldMappings?: Record<string, string>;
}

function resolve<T>(
  projectVal: T | undefined,
  workspaceVal: T | undefined,
  appDefault: T,
): ResolvedValue<T> {
  if (projectVal !== undefined) {
    return { value: projectVal, source: "project" };
  }
  if (workspaceVal !== undefined) {
    return { value: workspaceVal, source: "workspace" };
  }
  return { value: appDefault, source: "app" };
}

/**
 * Resolve the effective Notion configuration for a project by merging:
 *   project.taskManagementConfig  >  workspace.notionDefaultConfig  >  app defaults
 *
 * Each field carries a `source` so the UI can display "inherited from workspace" / "app default".
 */
export async function resolveNotionConfig(
  projectId: string,
): Promise<ResolvedNotionConfig> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      taskManagementConfig: true,
      workspaceId: true,
    },
  });

  const projectConfig = (project.taskManagementConfig as ProjectNotionConfig | null) ?? {};

  // Load workspace config if this project belongs to a workspace
  let workspaceConfig: WorkspaceNotionConfig = {};
  if (project.workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: project.workspaceId },
      select: { notionDefaultConfig: true },
    });
    workspaceConfig = (workspace?.notionDefaultConfig as WorkspaceNotionConfig | null) ?? {};
  }

  return {
    integrationId: resolve<string | null>(
      projectConfig.integrationId,
      workspaceConfig.defaultIntegrationId,
      null,
    ),
    databaseId: resolve<string | null>(
      projectConfig.databaseId,
      workspaceConfig.defaultDatabaseId,
      null,
    ),
    syncDirection: resolve(
      projectConfig.syncDirection,
      workspaceConfig.syncDirection,
      APP_DEFAULTS.syncDirection,
    ),
    syncFrequency: resolve(
      projectConfig.syncFrequency,
      workspaceConfig.syncFrequency,
      APP_DEFAULTS.syncFrequency,
    ),
    fieldMappings: resolve(
      projectConfig.fieldMappings,
      workspaceConfig.fieldMappings,
      APP_DEFAULTS.fieldMappings,
    ),
  };
}
