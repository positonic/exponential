import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { checkHandle, couldBeHandle, normaliseHandle } from "~/lib/personHandle";

/**
 * Person page handles (`/people/<handle>`), server side.
 *
 * A handle is only ever another way to name a user id. Every `person`
 * procedure turns its route segment into an id here first and then runs the
 * ordinary scope guard (`resolvePersonScope`) on that id, so a handle the
 * viewer may not see gets exactly the answer an unknown id gets. Nothing in
 * this file may answer differently because a handle exists.
 */

/**
 * Turn a `/people/<segment>` route segment (a user id or a handle) into a user
 * id. Never throws and never says whether anything matched: a segment that
 * names nobody is returned unchanged and fails the scope guard like any
 * unknown id.
 *
 * An id wins over a handle. A handle can never be set to an existing id or to
 * the shape of a generated one, so the two only collide if an account is later
 * created with a hand-written id; that account keeps its own URL.
 */
export async function resolvePersonSubjectId(
  db: PrismaClient,
  segment: string,
): Promise<string> {
  // A generated id (or anything else that breaks the handle rules) cannot be a
  // handle, so the common case of an id link costs no extra query.
  if (!couldBeHandle(segment)) return segment;

  const handle = normaliseHandle(segment);
  const matches = await db.user.findMany({
    where: { OR: [{ id: segment }, { handle }] },
    select: { id: true },
    take: 2,
  });
  if (matches.some((user) => user.id === segment)) return segment;
  return matches[0]?.id ?? segment;
}

/**
 * The one answer that reveals a handle exists. Accepted on purpose: nobody can
 * pick a handle without learning that theirs is taken.
 */
function handleTaken(): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: "That handle is taken. Pick another.",
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Set, change or clear (`null`) the caller's own handle. Humans only: an agent
 * stays on its id URL. The old handle is freed at once, with no history, so it
 * is immediately anyone's to take.
 */
export async function setOwnHandle(
  db: PrismaClient,
  userId: string,
  requested: string | null,
): Promise<{ handle: string | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAgent: true, handle: true },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  if (user.isAgent) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Agents cannot have a handle.",
    });
  }

  if (requested === null) {
    if (user.handle !== null) {
      await db.user.update({ where: { id: userId }, data: { handle: null } });
    }
    return { handle: null };
  }

  const check = checkHandle(requested);
  if (!check.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
  }
  const { handle } = check;
  if (handle === user.handle) return { handle };

  // Taken by someone else, or spelled like an existing user id: `/people/<id>`
  // must keep meaning that account.
  const clash = await db.user.findFirst({
    where: { OR: [{ handle }, { id: handle }] },
    select: { id: true },
  });
  if (clash) throw handleTaken();

  try {
    await db.user.update({ where: { id: userId }, data: { handle } });
  } catch (error) {
    // Two people asked for the same handle at once; the unique index decided.
    if (isUniqueViolation(error)) throw handleTaken();
    throw error;
  }
  return { handle };
}
