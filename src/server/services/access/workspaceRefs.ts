/**
 * Cross-workspace link guards.
 *
 * Tickets and actions carry optional foreign keys to workspace-scoped rows
 * (epic, feature, cycle, scope). The routers gate the *pointing* row — the
 * ticket's product workspace, the action's project — but a foreign key is a
 * second read path: the pointed-at row's fields come back inside the pointing
 * row's own `include`.
 *
 * So without this guard, a member of workspace A can create a ticket in their
 * own product, set `epicId` to an epic in workspace B, and read that epic's
 * name and status back through `ticket.getById`. That is the 2026-08-04 epic
 * audit finding (`epic.getById` had no membership check) reachable sideways.
 *
 * Every workspace-scoped reference must therefore live in the same workspace
 * as the row pointing at it. Mismatches raise NOT_FOUND rather than FORBIDDEN
 * so the error does not confirm that the id exists in some other workspace.
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

/**
 * Workspace-scoped rows a ticket or action can reference. A `null` or
 * `undefined` value means "not being set" and is skipped — unlinking is
 * always allowed.
 */
export interface WorkspaceScopedRefs {
  epicId?: string | null;
  featureId?: string | null;
  cycleId?: string | null;
  scopeId?: string | null;
}

/**
 * Throw unless every supplied reference resolves to `workspaceId`.
 *
 * `workspaceId` is the effective workspace of the pointing row. It may be
 * null (an action with no workspace), in which case any workspace-scoped
 * reference is incoherent and rejected.
 */
export async function assertWorkspaceScopedRefs(
  db: PrismaClient,
  workspaceId: string | null,
  refs: WorkspaceScopedRefs,
): Promise<void> {
  const lookups: Array<Promise<{ label: string; refWorkspaceId: string | null }>> =
    [];

  if (refs.epicId) {
    lookups.push(
      db.epic
        .findUnique({
          where: { id: refs.epicId },
          select: { workspaceId: true },
        })
        .then((row) => ({
          label: "Epic",
          refWorkspaceId: row?.workspaceId ?? null,
        })),
    );
  }

  if (refs.featureId) {
    lookups.push(
      db.feature
        .findUnique({
          where: { id: refs.featureId },
          select: { product: { select: { workspaceId: true } } },
        })
        .then((row) => ({
          label: "Feature",
          refWorkspaceId: row?.product.workspaceId ?? null,
        })),
    );
  }

  // A "cycle" is a List row (Ticket.cycle → List, relation "TicketCycle").
  if (refs.cycleId) {
    lookups.push(
      db.list
        .findUnique({
          where: { id: refs.cycleId },
          select: { workspaceId: true },
        })
        .then((row) => ({
          label: "Cycle",
          refWorkspaceId: row?.workspaceId ?? null,
        })),
    );
  }

  if (refs.scopeId) {
    lookups.push(
      db.featureScope
        .findUnique({
          where: { id: refs.scopeId },
          select: {
            feature: { select: { product: { select: { workspaceId: true } } } },
          },
        })
        .then((row) => ({
          label: "Scope",
          refWorkspaceId: row?.feature.product.workspaceId ?? null,
        })),
    );
  }

  if (lookups.length === 0) return;

  for (const { label, refWorkspaceId } of await Promise.all(lookups)) {
    if (!refWorkspaceId || refWorkspaceId !== workspaceId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `${label} not found in this workspace`,
      });
    }
  }
}
