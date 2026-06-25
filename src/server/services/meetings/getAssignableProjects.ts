import type { PrismaClient } from "@prisma/client";
import { buildProjectEditWhere } from "~/server/services/access";

/**
 * A project a meeting can be placed onto, carrying its workspace for grouping
 * in the placement picker.
 */
export interface AssignableProject {
  id: string;
  name: string;
  /** Null for personal (workspace-less) projects. */
  workspaceId: string | null;
  workspaceName: string | null;
}

/**
 * The candidate projects for placing a meeting: every project the caller can
 * **edit**, across all their workspaces, each tagged with its workspace so the
 * picker can group by workspace. Edit (not view) is the bar because placement
 * itself requires edit access — see {@link buildProjectEditWhere}. Ordered by
 * workspace name, then project name, for stable grouped rendering.
 *
 * Deep module: pure read-side query, no tRPC/React types in the interface.
 */
export async function getAssignableProjects(
  db: PrismaClient,
  userId: string,
): Promise<AssignableProject[]> {
  const projects = await db.project.findMany({
    where: buildProjectEditWhere(userId),
    select: {
      id: true,
      name: true,
      workspaceId: true,
      workspace: { select: { name: true } },
    },
    orderBy: [{ workspace: { name: "asc" } }, { name: "asc" }],
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    workspaceId: p.workspaceId,
    workspaceName: p.workspace?.name ?? null,
  }));
}
