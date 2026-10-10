/**
 * Action dependencies ("blocked by"): the write rules for `ActionDependency`
 * rows, shared by `createAction` and `applyActionUpdate` so the guards cannot
 * drift between "link on create" and "link later". ADR-0062.
 *
 * Three rules, the same three `TicketDependency` enforces:
 *   - a blocker must be an action the actor can read, in the same workspace
 *     (a dependency is a read path: the blocker's name and status come back
 *     inside the action's own include);
 *   - no self-dependency;
 *   - no cycles (BFS over `depsOut`, as `wouldCreateCycle` for tickets).
 */
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildActionAccessWhere } from "~/server/services/access/resolvers/actionResolver";

type Db = PrismaClient | Prisma.TransactionClient;

/** The include every action read carries so `deriveActionBlocked` can run on the row. */
export const blockedByInclude = {
  depsOut: {
    select: {
      id: true,
      dependsOn: {
        select: { id: true, name: true, status: true, kanbanStatus: true, projectId: true },
      },
    },
  },
} satisfies Prisma.ActionInclude;

/**
 * True when `targetId` is reachable from `startId` along `depsOut` edges.
 * Adding the edge `action → dependsOn` is a cycle iff `action` is reachable
 * from `dependsOn`, so callers pass `(dependsOnId, actionId)`.
 */
export async function wouldCreateActionCycle(
  db: Db,
  startId: string,
  targetId: string,
): Promise<boolean> {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await db.actionDependency.findMany({
      where: { actionId: current },
      select: { dependsOnId: true },
    });
    for (const e of edges) {
      if (e.dependsOnId === targetId) return true;
      if (!visited.has(e.dependsOnId)) queue.push(e.dependsOnId);
    }
  }
  return false;
}

/**
 * Throw unless every id is an action the actor can read inside
 * `workspaceId`. With no workspace (a personal action) containment is
 * undefined, so only the actor's own actions qualify — the same fallback
 * `action.searchForDependencies` uses for the picker. NOT_FOUND, so the
 * error does not confirm an id exists elsewhere.
 */
export async function assertLinkableBlockers(
  db: Db,
  userId: string,
  workspaceId: string | null,
  actionIds: string[],
): Promise<void> {
  const unique = [...new Set(actionIds)];
  if (unique.length === 0) return;
  const rows = await db.action.findMany({
    where: {
      id: { in: unique },
      status: { notIn: ["DELETED"] },
      // Both clauses are `OR`-shaped, so they are AND-ed explicitly (see
      // `assertLinkableActions` in decision.ts).
      AND: [
        workspaceId
          ? { OR: [{ workspaceId }, { project: { workspaceId } }] }
          : { createdById: userId },
        buildActionAccessWhere(userId),
      ],
    },
    select: { id: true },
  });
  if (rows.length !== unique.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Blocking action not found in this workspace",
    });
  }
}

/**
 * Make `actionId`'s blockers exactly `dependsOnIds`: remove edges no longer
 * listed, add the new ones (each cycle-checked against the graph as it
 * stands, including edges added earlier in this call). Run inside the
 * caller's transaction. Containment (`assertLinkableBlockers`) is the
 * caller's job, before the transaction opens. Returns whether any edge
 * was added or removed, so an unchanged list logs no activity.
 */
export async function setActionBlockers(
  tx: Db,
  actionId: string,
  dependsOnIds: string[],
  actorUserId: string,
): Promise<boolean> {
  const wanted = [...new Set(dependsOnIds)];
  if (wanted.includes(actionId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An action cannot be blocked by itself.",
    });
  }
  const existing = await tx.actionDependency.findMany({
    where: { actionId },
    select: { dependsOnId: true },
  });
  const current = new Set(existing.map((e) => e.dependsOnId));
  const toRemove = [...current].filter((id) => !wanted.includes(id));
  const toAdd = wanted.filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    await tx.actionDependency.deleteMany({
      where: { actionId, dependsOnId: { in: toRemove } },
    });
  }
  for (const dependsOnId of toAdd) {
    if (await wouldCreateActionCycle(tx, dependsOnId, actionId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This would create a dependency cycle.",
      });
    }
    await tx.actionDependency.create({
      data: { actionId, dependsOnId, createdById: actorUserId },
    });
  }
  return toRemove.length > 0 || toAdd.length > 0;
}
