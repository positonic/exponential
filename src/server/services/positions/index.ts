/**
 * Positions: who does what in a workspace (ADR-0068).
 *
 * One module owns everything Position-shaped so the settings page, both
 * Assign-modal rosters and (V2) Zoe's roster cannot drift — ADR-0068 §5,
 * "one roster shape". A Position is routing data only: nothing under
 * `services/access/` may read it, and a static guard test pins that.
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient, Prisma } from "@prisma/client";
import { getWorkspaceMembership, hasMinimumWorkspaceRole } from "../access";

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

/**
 * Who may edit which part of a Position (ADR-0068 §4), decided in one place:
 * title and "not accountable for" need a workspace owner or admin; the Remit
 * needs owner/admin OR that the caller holds the Position — the gate is
 * "holds it", so a viewer who holds one may edit its Remit (Agent PRD D12).
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

/**
 * The counts behind the chat's "Import roles & responsibilities" pill
 * (Agent PRD D11).
 */
export interface PositionCoverage {
  isPersonal: boolean;
  /** `WorkspaceUser` rows of the workspace, of any kind. */
  memberCount: number;
  /** Humans plus Assistant principals. Plain External agents are not counted. */
  eligibleCount: number;
  /** Eligible members holding at least one Position in the workspace. */
  coveredCount: number;
}

/**
 * Should the chat nudge this workspace to import its Positions? Only in a
 * team workspace with two or more humans and Assistants, fewer than half of
 * whom hold a Position. A plain External agent never counts towards the
 * two: one human beside a plain agent has nobody to route work to, the same
 * reason a personal workspace never qualifies.
 */
export function shouldOfferPositionImport(coverage: PositionCoverage): boolean {
  return (
    !coverage.isPersonal &&
    coverage.eligibleCount >= 2 &&
    coverage.coveredCount * 2 < coverage.eligibleCount
  );
}

/** Read the workspace's `PositionCoverage`. Two queries, run together. */
export async function loadPositionCoverage(
  db: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
): Promise<PositionCoverage> {
  const [workspace, members] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } }),
    db.workspaceUser.findMany({
      where: { workspaceId },
      select: {
        user: {
          select: {
            isAgent: true,
            // An Assistant is an External agent with an Assistant row (ADR-0067).
            externalAgentShadow: { select: { assistant: { select: { id: true } } } },
          },
        },
        // One holding is enough to count as covered.
        positionHolders: {
          where: { position: { workspaceId } },
          select: { positionId: true },
          take: 1,
        },
      },
    }),
  ]);

  let eligibleCount = 0;
  let coveredCount = 0;
  for (const member of members) {
    const isEligible = !member.user.isAgent || !!member.user.externalAgentShadow?.assistant;
    if (!isEligible) continue;
    eligibleCount += 1;
    if (member.positionHolders.length > 0) coveredCount += 1;
  }

  return {
    isPersonal: workspace?.type === "personal",
    memberCount: members.length,
    eligibleCount,
    coveredCount,
  };
}

/** One row of a Positions import, as Zoe drafted it (Agent PRD D10). */
export interface PositionImportRow {
  title: string;
  remit: string;
  /** Omitted keeps the stored value on an update; an empty string clears it. */
  notAccountableFor?: string;
  holderUserIds: string[];
}

/** A Position already in the workspace, as the import matches against it. */
export interface ExistingPositionForImport {
  id: string;
  title: string;
  notAccountableFor: string | null;
  holderUserIds: string[];
}

export type PlannedPositionImport =
  | {
      outcome: "create";
      title: string;
      remit: string;
      /** The value the Position will have. */
      notAccountableFor: string | null;
      /** Every holder of the new Position. */
      holderUserIds: string[];
    }
  | {
      outcome: "update";
      positionId: string;
      /** The stored title: an import matches case-insensitively and never renames. */
      title: string;
      remit: string;
      /** The value after the import: kept when the row omits it, cleared by "". */
      notAccountableFor: string | null;
      /** Every holder after the import: the existing ones, then the added ones. */
      holderUserIds: string[];
      /** Only the holders the import adds — the rows to write. */
      addedHolderUserIds: string[];
    };

/** The key titles are matched on: trimmed, case-folded. */
export function positionTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Plan an import (Agent PRD D3, `position.importMany`). Pure, so the dry run
 * and the real run cannot disagree about what happens.
 *
 * Upsert by title, matched case-insensitively within the workspace: a new
 * title creates; a matching one replaces its Remit, keeps its "not
 * accountable for" unless the row states one (an empty string clears it),
 * and **adds** holders. An import never removes a holder — that is a
 * settings action. Results are in input order. The caller rejects duplicate
 * titles in the input before planning.
 *
 * Titles are unique per workspace case-sensitively, so "Travel" and "travel"
 * can both exist; an import then updates the exact-case match, else the
 * first in title order.
 */
export function planPositionImport(
  existing: ExistingPositionForImport[],
  rows: PositionImportRow[],
): PlannedPositionImport[] {
  const byKey = new Map<string, ExistingPositionForImport>();
  for (const position of [...existing].sort((a, b) => a.title.localeCompare(b.title))) {
    const key = positionTitleKey(position.title);
    if (!byKey.has(key)) byKey.set(key, position);
  }

  return rows.map((row) => {
    const title = row.title.trim();
    // undefined: the row says nothing; null: the row clears it.
    const stated = row.notAccountableFor?.trim();
    const statedNotAccountableFor = stated === undefined ? undefined : stated.length > 0 ? stated : null;
    const importedHolders = [...new Set(row.holderUserIds)];
    const match =
      existing.find((position) => position.title === title) ?? byKey.get(positionTitleKey(title));

    if (!match) {
      return {
        outcome: "create",
        title,
        remit: row.remit,
        notAccountableFor: statedNotAccountableFor ?? null,
        holderUserIds: importedHolders,
      };
    }

    const current = new Set(match.holderUserIds);
    const addedHolderUserIds = importedHolders.filter((userId) => !current.has(userId));
    return {
      outcome: "update",
      positionId: match.id,
      title: match.title,
      remit: row.remit,
      notAccountableFor:
        statedNotAccountableFor === undefined ? match.notAccountableFor : statedNotAccountableFor,
      holderUserIds: [...match.holderUserIds, ...addedHolderUserIds],
      addedHolderUserIds,
    };
  });
}
