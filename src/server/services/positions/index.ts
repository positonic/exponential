/**
 * Positions: who does what in a workspace (ADR-0068).
 *
 * One module owns everything Position-shaped so the settings page, both
 * Assign-modal rosters and (V2) Zoe's roster cannot drift — ADR-0068 §5,
 * "one roster shape". A Position is routing data only: nothing under
 * `services/access/` may read it; a static guard test catches accidental drift.
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient, Prisma } from "@prisma/client";
import { getWorkspaceMembership, hasMinimumWorkspaceRole } from "../access";
import { toAssignableUser, type AssignableUser, type AssignableUserRow } from "../access/assignability";

export interface PositionSummary {
  id: string;
  title: string;
  /** Markdown. */
  remit: string;
  /** Markdown, or null when the Position states no exclusions. */
  notAccountableFor: string | null;
}

export const POSITION_SUMMARY_SELECT = {
  id: true,
  title: true,
  remit: true,
  notAccountableFor: true,
} as const satisfies Prisma.PositionSelect;

/**
 * The ONE mapping from members to the Positions they hold (ADR-0068 §5).
 *
 * Positions held in `workspaceId`, keyed by userId, in title order. A user
 * who holds none is absent from the map; callers default to `[]`. One query,
 * none when there is nobody to look up.
 */
export async function loadPositionsByUser(
  db: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, PositionSummary[]>> {
  const byUser = new Map<string, PositionSummary[]>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return byUser;

  const holdings = await db.positionHolder.findMany({
    where: {
      // Both sides scoped to the workspace: the router keeps a holding's
      // Position and membership in one workspace, and the read defends it too.
      position: { workspaceId },
      workspaceUser: { userId: { in: unique }, workspaceId },
    },
    select: {
      workspaceUser: { select: { userId: true } },
      position: { select: POSITION_SUMMARY_SELECT },
    },
    orderBy: { position: { title: "asc" } },
  });

  for (const holding of holdings) {
    const userId = holding.workspaceUser.userId;
    const list = byUser.get(userId) ?? [];
    list.push(holding.position);
    byUser.set(userId, list);
  }
  return byUser;
}

/**
 * The one mapping from roster rows to `AssignableUser`s with their Positions
 * (ADR-0068 §5). `workspaceId` is the workspace the roster trusts; `null`
 * means there is none, so every row gets `positions: []` and an agent's
 * description stands in as its Remit.
 */
export async function attachPositions(
  db: PrismaClient,
  workspaceId: string | null,
  rows: AssignableUserRow[],
): Promise<AssignableUser[]> {
  const positionsByUser = workspaceId
    ? await loadPositionsByUser(db, workspaceId, rows.map((row) => row.id))
    : new Map<string, PositionSummary[]>();
  return rows.map((row) => toAssignableUser(row, positionsByUser.get(row.id) ?? []));
}

/**
 * Does this member's row need the "no stated remit" warning?
 *
 * A human needs a Position. An agent (Assistant or External agent) can fall
 * back on its own description as a Remit (ADR-0068 §3), so it is only a gap
 * when it has neither.
 */
export function hasRemitGap(member: {
  isAgent: boolean;
  positionCount: number;
  agentDescription: string | null;
}): boolean {
  if (member.positionCount > 0) return false;
  if (!member.isAgent) return true;
  return !member.agentDescription?.trim();
}

/**
 * Who may edit which part of a Position (ADR-0068 §4), decided in one place:
 * title and "not accountable for" need a workspace owner or admin; the Remit
 * needs owner/admin OR that the caller holds the Position AND is at least a
 * `member`. A viewer stays read-only everywhere, even as a holder: Agent PRD
 * D12 left this open with "allowed" as the default and "tighten if viewers
 * should stay read-only" as the alternative; the house invariant (workspace
 * membership never implies write rights) decides it, and ADR-0068 §4 records it.
 *
 * The Role comes from the centralized access resolver, where team-based
 * access resolves to `member`: never an admin, and with no `WorkspaceUser` row
 * it can hold nothing either. Throws FORBIDDEN; this is routing data, so the
 * decision lives here rather than in `services/access/`, which never reads a
 * Position.
 */
export async function assertCanEditPosition(
  db: PrismaClient,
  input: {
    userId: string;
    workspaceId: string;
    positionId: string;
    edits: { titleOrScope: boolean; remit: boolean };
  },
): Promise<void> {
  const membership = await getWorkspaceMembership(db, input.userId, input.workspaceId);
  const isAdmin = !!membership && hasMinimumWorkspaceRole(membership.role, "admin");
  if (isAdmin) return;

  if (input.edits.titleOrScope) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a workspace owner or admin can rename a Position or change what it is not accountable for",
    });
  }
  if (input.edits.remit) {
    // Role floor first, so a viewer never reaches the holder lookup.
    if (!membership || !hasMinimumWorkspaceRole(membership.role, "member")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only a workspace owner or admin, or a holder of this Position, can edit its Remit",
      });
    }
    const holding = await db.positionHolder.findFirst({
      where: {
        positionId: input.positionId,
        workspaceUser: { userId: input.userId, workspaceId: input.workspaceId },
      },
      select: { positionId: true },
    });
    if (!holding) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only a workspace owner or admin, or a holder of this Position, can edit its Remit",
      });
    }
  }
}
