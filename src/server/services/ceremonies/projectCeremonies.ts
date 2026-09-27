/**
 * Linking ceremonies to a project.
 *
 * `CeremonyProject` is the link (ADR-0059, amended 2026-09-27): a ceremony
 * reviews any number of projects and a project is reviewed in any number of
 * ceremonies. The project form edits the set from the project's side, so this
 * reconciles "these are the project's ceremonies now" against the join rows:
 * add the listed ones, remove the ones it used to have. Other projects' links
 * to the same ceremonies are untouched.
 *
 * Ceremonies are workspace-scoped, so a project can only link ceremonies of
 * its own workspace; a personal project (no workspace) links none.
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

  const { count: unlinked } = await db.ceremonyProject.deleteMany({
    where: { projectId, ...(wanted.length ? { ceremonyId: { notIn: wanted } } : {}) },
  });

  // `skipDuplicates` keeps an already-linked pair; re-linking is a no-op.
  const { count: linked } = wanted.length
    ? await db.ceremonyProject.createMany({
        data: wanted.map((ceremonyId) => ({ ceremonyId, projectId })),
        skipDuplicates: true,
      })
    : { count: 0 };

  return { linked, unlinked };
}
