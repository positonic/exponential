import { db } from "~/server/db";
import type { StatusMappings } from "~/server/services/sync/types";

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
  statusProperty: ResolvedValue<string | null>;
  statusMappings: ResolvedValue<StatusMappings | null>;
}

/** Default status mappings for common Notion status values to kanban columns */
const DEFAULT_STATUS_MAPPINGS: StatusMappings = {
  toLocal: {
    'Done': 'DONE',
    'Completed': 'DONE',
    'Complete': 'DONE',
    'Finished': 'DONE',
    'In Progress': 'IN_PROGRESS',
    'In progress': 'IN_PROGRESS',
    'Doing': 'IN_PROGRESS',
    'Active': 'IN_PROGRESS',
    'In Review': 'IN_REVIEW',
    'In review': 'IN_REVIEW',
    'Review': 'IN_REVIEW',
    'Todo': 'TODO',
    'To Do': 'TODO',
    'To do': 'TODO',
    'To-do': 'TODO',
    'Open': 'TODO',
    'New': 'TODO',
    'Not Started': 'BACKLOG',
    'Not started': 'BACKLOG',
    'Backlog': 'BACKLOG',
    'Icebox': 'BACKLOG',
    'Cancelled': 'CANCELLED',
    'Canceled': 'CANCELLED',
    'Archived': 'CANCELLED',
  },
  toExternal: {
    'DONE': 'Done',
    'IN_PROGRESS': 'In Progress',
    'IN_REVIEW': 'In Review',
    'TODO': 'To Do',
    'BACKLOG': 'Not Started',
    'CANCELLED': 'Cancelled',
  },
};

/** App-level defaults used when neither project nor workspace provides a value. */
const APP_DEFAULTS: {
  syncDirection: "pull" | "push" | "bidirectional";
  syncFrequency: "manual" | "hourly" | "daily";
  fieldMappings: Record<string, string>;
  statusProperty: string | null;
  statusMappings: StatusMappings | null;
} = {
  syncDirection: "pull",
  syncFrequency: "manual",
  fieldMappings: {},
  statusProperty: null,
  statusMappings: DEFAULT_STATUS_MAPPINGS,
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
  statusProperty?: string;
  statusMappings?: StatusMappings;
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
  statusProperty?: string;
  statusMappings?: StatusMappings;
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
    statusProperty: resolve<string | null>(
      projectConfig.statusProperty,
      workspaceConfig.statusProperty,
      APP_DEFAULTS.statusProperty,
    ),
    statusMappings: resolve<StatusMappings | null>(
      projectConfig.statusMappings,
      workspaceConfig.statusMappings,
      APP_DEFAULTS.statusMappings,
    ),
  };
}
