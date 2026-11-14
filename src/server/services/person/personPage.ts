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
  /** The person who owns the agent; `null` for a human subject. */
  owner: { id: string; name: string | null; image: string | null } | null;
  /**
   * Workspaces the viewer and the subject both belong to today. The header
   * lists them and the feed's workspace filter is built from them.
   */
  sharedWorkspaces: PersonWorkspaceRef[];
  /** Positions the subject holds, in `sharedWorkspaces` only. */
  positions: Array<{ workspaceId: string; positionId: string; title: string }>;
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
  const sharedIds = scope.sharedWorkspaces.map((workspace) => workspace.id);

  const [user, holdings] = await Promise.all([
    db.user.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, image: true, isAgent: true },
    }),
    // A holder is a `WorkspaceUser` row (ADR-0068), so a subject who reaches a
    // workspace only through a team holds no Position there. That is correct.
    sharedIds.length > 0
      ? db.positionHolder.findMany({
          where: {
            workspaceUser: {
              userId: subjectId,
              workspaceId: { in: sharedIds },
            },
          },
          select: {
            position: {
              select: { id: true, title: true, workspaceId: true },
            },
          },
          orderBy: { position: { title: "asc" } },
        })
      : [],
  ]);
  // Deleted between the scope check and here: same answer as never existing.
  if (!user) throw personNotFound();

  // Every agent shadow user belongs to exactly one ExternalAgent, whose owner
  // is required. An Assistant's principal is such an agent too (ADR-0067), so
  // this is its owner as well — not `Assistant.createdById`.
  const agent = user.isAgent
    ? await db.externalAgent.findUnique({
        where: { shadowUserId: subjectId },
        select: { owner: { select: { id: true, name: true, image: true } } },
      })
    : null;

  return {
    user,
    owner: agent?.owner ?? null,
    sharedWorkspaces: scope.sharedWorkspaces,
    positions: holdings.map(({ position }) => ({
      workspaceId: position.workspaceId,
      positionId: position.id,
      title: position.title,
    })),
    isSelf: scope.isSelf,
  };
}
