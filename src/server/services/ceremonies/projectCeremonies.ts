/**
 * Linking ceremonies to a project.
 *
 * `Ceremony.projectId` is the link (ADR-0059): a ceremony belongs to at most one
 * project, a project can own several. The project form edits the set from the
 * project's side, so this reconciles "these are the project's ceremonies now"
 * against the rows: link the listed ones, unlink the ones it used to own.
 *
 * Ceremonies are workspace-scoped, so a project can only own ceremonies of its
 * own workspace; a personal project (no workspace) owns none.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

type Db = PrismaClient | Prisma.TransactionClient;

export interface SyncProjectCeremoniesInput {
  projectId: string;
  workspaceId: string | null;
  ceremonyIds: string[];
}

export async function syncProjectCeremonies(
  db: Db,
  { projectId, workspaceId, ceremonyIds }: SyncProjectCeremoniesInput,
): Promise<{ linked: number; unlinked: number }> {
  const wanted = Array.from(new Set(ceremonyIds));

  if (wanted.length > 0) {
    if (!workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A project without a workspace cannot be linked to ceremonies.",
      });
    }
    const inWorkspace = await db.ceremony.count({
      where: { id: { in: wanted }, workspaceId },
    });
    if (inWorkspace !== wanted.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One or more ceremonies are not in this project's workspace.",
      });
    }
  }

  const { count: unlinked } = await db.ceremony.updateMany({
    where: { projectId, ...(wanted.length ? { id: { notIn: wanted } } : {}) },
    data: { projectId: null },
  });

  // No `NOT: { projectId }` guard here: Prisma's `not` on a nullable column
  // excludes NULL rows, and a never-linked ceremony has a NULL projectId — the
  // guard silently skipped exactly the rows this exists to link. Re-writing an
  // already-linked row is harmless.
  const { count: linked } = wanted.length
    ? await db.ceremony.updateMany({
        where: { id: { in: wanted } },
        data: { projectId },
      })
    : { count: 0 };

  return { linked, unlinked };
}
