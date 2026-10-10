/**
 * Positions: who does what in a workspace (ADR-0068).
 *
 * One module owns everything Position-shaped so the settings page, both
 * Assign-modal rosters and (V2) Zoe's roster cannot drift — ADR-0068 §5,
 * "one roster shape". A Position is routing data only: nothing under
 * `services/access/` may read it, and a static guard test pins that.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

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
      position: { workspaceId },
      workspaceUser: { userId: { in: unique } },
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
