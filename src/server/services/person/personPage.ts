import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access";

/**
 * Person page (`/people/<userId>`): who the viewer may look at, and through
 * which workspaces.
 *
 * The page is a lens on activity the viewer can already see, so its scope is
 * the viewer's own workspaces — never the subject's. Two consequences:
 *
 * - The feed covers every workspace the viewer belongs to, whether or not the
 *   subject is still a member. A teammate who left keeps their history there,
 *   exactly as it still shows in that workspace's own Activity feed.
 * - A subject the viewer shares no workspace with, and none of whose events the
 *   viewer can see, does not exist as far as the viewer can tell. An unknown
 *   id, a deleted user and a stranger all get the same `NOT_FOUND`, so the page
 *   cannot be used to test whether an account exists.
 */

export interface PersonWorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

export interface PersonScope {
  /**
   * Every workspace the viewer belongs to (direct or team membership; not
   * project-only guests — the same strict rule as the Aggregated activity feed).
   */
  visibleWorkspaces: PersonWorkspaceRef[];
  /** The subset the subject currently belongs to as well. */
  sharedWorkspaces: PersonWorkspaceRef[];
  isSelf: boolean;
}

/** One message for every reason a Person page is not shown. */
const PERSON_NOT_FOUND_MESSAGE = "Person not found";

export function personNotFound(): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND_MESSAGE });
}

/**
 * Resolve the viewer's scope on a subject, or throw the uniform `NOT_FOUND`.
 * Both `person.get` and `person.getFeed` go through this, so neither can be
 * used to probe for an account the other hides.
 */
export async function resolvePersonScope(
  db: PrismaClient,
  viewerId: string,
  subjectId: string,
): Promise<PersonScope> {
  const visibleWorkspaces = await db.workspace.findMany({
    where: buildWorkspaceAccessWhere(viewerId),
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  const isSelf = viewerId === subjectId;
  if (isSelf) {
    return { visibleWorkspaces, sharedWorkspaces: visibleWorkspaces, isSelf };
  }

  const visibleIds = visibleWorkspaces.map((workspace) => workspace.id);
  if (visibleIds.length === 0) throw personNotFound();

  const sharedWorkspaces = await db.workspace.findMany({
    where: {
      AND: [{ id: { in: visibleIds } }, buildWorkspaceAccessWhere(subjectId)],
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  if (sharedWorkspaces.length === 0) {
    // No shared workspace today. The subject is still visible if they left
    // behind events in a workspace the viewer belongs to.
    const visibleEvent = await db.workspaceActivityEvent.findFirst({
      where: { userId: subjectId, workspaceId: { in: visibleIds } },
      select: { id: true },
    });
    if (!visibleEvent) throw personNotFound();
  }

  return { visibleWorkspaces, sharedWorkspaces, isSelf };
}

export interface PersonSummary {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    isAgent: boolean;
  };
  isSelf: boolean;
}

/**
 * Header data for a Person page. Selects only what the header shows — never
 * the subject's email (`user.getById` returns it to any signed-in caller, which
 * is why the page does not reuse it).
 */
export async function getPersonSummary(
  db: PrismaClient,
  viewerId: string,
  subjectId: string,
): Promise<PersonSummary> {
  const scope = await resolvePersonScope(db, viewerId, subjectId);

  const user = await db.user.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, image: true, isAgent: true },
  });
  // Deleted between the scope check and here: same answer as never existing.
  if (!user) throw personNotFound();

  return { user, isSelf: scope.isSelf };
}
