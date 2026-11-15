/**
 * Resource Access Resolver (ADR-0082)
 *
 * A Resource is owned by the person who saved it, and every write stays with
 * the owner. Reading has one more path: **filing shares**. A Resource filed
 * under a Project is visible to everyone who is in that Project, restricted
 * Projects included; one with no Project is visible only to its owner.
 *
 * Three conditions make a Resource shared with a viewer, and all three are
 * read from live rows, so access follows membership as it changes:
 *
 * 1. It is filed under a Project and sits in that Project's workspace. Filing
 *    sets the workspace, so a row whose workspace disagrees with its Project
 *    is one that was never filed under the sharing rule, and it stays private.
 * 2. The viewer reaches the Project by a membership path
 *    (`buildProjectInsiderWhere`). Being able to read a *public* Project is
 *    not enough: what a member clipped belongs to the people in the Project.
 * 3. The owner still belongs to the Project's workspace, directly or through
 *    a team, as a Page grant requires of its grantee (ADR-0080). When the
 *    owner leaves, their Resources stop being visible through its Projects.
 *
 * This is the person's rule. An agent works on its owner's rows in the
 * workspaces delegated to it (ADR-0079) and gains nothing here: callers skip
 * these helpers for an agent principal.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { buildProjectInsiderWhere } from "./projectResolver";
import { buildWorkspaceVisibilityWhere } from "./workspaceResolver";

/**
 * The owner of a Resource still belongs to this workspace: a direct member,
 * or in a team linked to it. Mirrors `buildWorkspaceAccessWhere`, read from
 * the User side.
 */
export function resourceOwnerInWorkspaceWhere(workspaceId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { workspaceMemberships: { some: { workspaceId } } },
      { teams: { some: { team: { workspaceId } } } },
    ],
  };
}

/** The Resources of one workspace that are shared with a viewer. */
function sharedInWorkspaceWhere(viewerId: string, workspaceId: string): Prisma.ResourceWhereInput {
  return {
    workspaceId,
    project: { AND: [{ workspaceId }, buildProjectInsiderWhere(viewerId)] },
    user: resourceOwnerInWorkspaceWhere(workspaceId),
  };
}

/**
 * Prisma WHERE clause for the Resources other people have shared with a
 * viewer through a Project, or null when there can be none. It matches the
 * viewer's own filed Resources too; OR it with the owner clause for "every
 * Resource this person can see".
 *
 * One query, for the workspaces the viewer can see at all: "the owner belongs
 * to the Project's workspace" compares two rows' columns, which a Prisma
 * filter cannot say, so the clause is built per workspace.
 *
 * `only.workspaceId` narrows to one workspace; `only.projectId` to one
 * Project.
 */
export async function buildSharedResourceWhere(
  db: PrismaClient,
  viewerId: string,
  only: { workspaceId?: string; projectId?: string } = {},
): Promise<Prisma.ResourceWhereInput | null> {
  const workspaces = await db.workspace.findMany({
    where: {
      AND: [
        buildWorkspaceVisibilityWhere(viewerId),
        ...(only.workspaceId ? [{ id: only.workspaceId }] : []),
        ...(only.projectId ? [{ projects: { some: { id: only.projectId } } }] : []),
      ],
    },
    select: { id: true },
  });
  if (workspaces.length === 0) return null;

  const shared: Prisma.ResourceWhereInput = {
    OR: workspaces.map(({ id }) => sharedInWorkspaceWhere(viewerId, id)),
  };
  return only.projectId ? { AND: [{ projectId: only.projectId }, shared] } : shared;
}

/**
 * The Projects of one workspace whose filed Resources a viewer may read, for
 * the Knowledge search, which builds its access condition in SQL. The search
 * adds the owner-still-belongs check itself, against the live Resource row.
 */
export async function listSharedResourceProjectIds(
  db: PrismaClient,
  viewerId: string,
  workspaceId: string,
): Promise<string[]> {
  const projects = await db.project.findMany({
    where: { AND: [{ workspaceId }, buildProjectInsiderWhere(viewerId)] },
    select: { id: true },
  });
  return projects.map((project) => project.id);
}
