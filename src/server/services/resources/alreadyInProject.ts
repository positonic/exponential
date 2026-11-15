/**
 * A Project lists a page once (ADR-0082).
 *
 * Once Resources filed under a Project are shared, two members saving the
 * same page into one Project would list it twice, and the list would get
 * worse with every member. So a page someone else already filed there cannot
 * be filed there again, by a save or by a move. The caller is told which
 * Resource it is and who saved it, so a client can say "Already in this
 * project, saved by James".
 *
 * Pages are matched by identity (`src/lib/resources/identity.ts`), so the same
 * listing with other dates or a tracking parameter is the same page.
 */
import type { PrismaClient } from "@prisma/client";
import { buildSharedResourceWhere } from "~/server/services/access/resolvers/resourceResolver";

/** The Resource that already holds a page's place in a Project. */
export interface AlreadyInProject {
  resourceId: string;
  title: string;
  projectId: string;
  owner: { id: string; name: string | null };
}

/**
 * Thrown as the `cause` of a `CONFLICT` when filing is refused. The tRPC error
 * formatter forwards `alreadyInProject` as `error.data.alreadyInProject`, which
 * is how a client tells this refusal from every other error.
 */
export class ResourceAlreadyInProjectError extends Error {
  constructor(public readonly alreadyInProject: AlreadyInProject) {
    super(`Already in this project, saved by ${alreadyInProject.owner.name ?? "a teammate"}`);
    this.name = "ResourceAlreadyInProjectError";
  }
}

/** The structured refusal on an error or its cause, for the tRPC `errorFormatter`. */
export function alreadyInProjectFromError(error: unknown): AlreadyInProject | null {
  if (error instanceof ResourceAlreadyInProjectError) return error.alreadyInProject;
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof ResourceAlreadyInProjectError ? cause.alreadyInProject : null;
}

/**
 * Someone else's Resource for this page that the Project already lists, or
 * null. "Lists" is what the Project's members can see: an archived Resource,
 * or one whose owner has left the workspace, does not hold the page's place.
 *
 * `ownerId` is the person filing: the caller, or an agent's owner. Their own
 * Resource for the page never counts; saving it again updates it.
 */
export async function findPageInProject(
  db: PrismaClient,
  ownerId: string,
  page: { projectId: string; identity: string },
): Promise<AlreadyInProject | null> {
  const shared = await buildSharedResourceWhere(db, ownerId, { projectId: page.projectId });
  if (!shared) return null;

  const row = await db.resource.findFirst({
    where: {
      AND: [shared, { identity: page.identity, archivedAt: null, userId: { not: ownerId } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, user: { select: { id: true, name: true } } },
  });
  if (!row) return null;
  return { resourceId: row.id, title: row.title, projectId: page.projectId, owner: row.user };
}
