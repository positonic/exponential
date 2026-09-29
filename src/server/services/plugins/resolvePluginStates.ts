import type { PluginConfig, PrismaClient } from "@prisma/client";

/** Workspace roles whose plugin choices become the default for everyone else. */
const WORKSPACE_DEFAULT_ROLES = ["owner", "admin"];

export interface ResolvedPluginStates {
  /** The caller's own PluginConfig rows for this scope (carry per-user settings). */
  ownConfigs: PluginConfig[];
  /**
   * Explicit enabled/disabled state per plugin id. Plugins absent from the map
   * fall back to their manifest's `defaultEnabled`.
   */
  enabledById: Map<string, boolean>;
}

/**
 * Resolves which plugins are switched on for a user in a workspace.
 *
 * PluginConfig rows are keyed per user, but toggling a plugin on the workspace
 * plugins page is meant to be a workspace decision. So, per plugin:
 *   1. the user's own row wins;
 *   2. otherwise the most recent choice by a workspace owner/admin applies —
 *      this is what makes a newly added member see e.g. Products;
 *   3. otherwise the caller falls back to the manifest default.
 *
 * Step 2 only applies when the user is a member of the workspace, so
 * non-members learn nothing about its configuration.
 */
export async function resolvePluginStates(
  db: PrismaClient,
  userId: string,
  workspaceId: string | null,
): Promise<ResolvedPluginStates> {
  const [ownConfigs, workspaceDefaults] = await Promise.all([
    db.pluginConfig.findMany({ where: { userId, workspaceId } }),
    workspaceId ? loadWorkspaceDefaults(db, userId, workspaceId) : new Map<string, boolean>(),
  ]);

  const enabledById = new Map(workspaceDefaults);
  for (const config of ownConfigs) {
    enabledById.set(config.pluginId, config.enabled);
  }

  return { ownConfigs, enabledById };
}

async function loadWorkspaceDefaults(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<Map<string, boolean>> {
  const defaults = new Map<string, boolean>();

  const membership = await db.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { id: true },
  });
  if (!membership) return defaults;

  const admins = await db.workspaceUser.findMany({
    where: { workspaceId, role: { in: WORKSPACE_DEFAULT_ROLES } },
    select: { userId: true },
  });
  if (admins.length === 0) return defaults;

  const adminConfigs = await db.pluginConfig.findMany({
    where: { workspaceId, userId: { in: admins.map((a) => a.userId) } },
    select: { pluginId: true, enabled: true },
    orderBy: { updatedAt: "desc" },
  });

  // Newest first, so the first row seen per plugin is the latest admin choice.
  for (const config of adminConfigs) {
    if (!defaults.has(config.pluginId)) {
      defaults.set(config.pluginId, config.enabled);
    }
  }
  return defaults;
}
