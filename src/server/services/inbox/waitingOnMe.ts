import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildDecisionAccessWhereAcrossWorkspaces,
  buildWorkspaceAccessWhere,
} from "~/server/services/access";
import { myOverdueActionsWhere } from "~/server/services/actions/myActionsWhere";
import { partitionActions } from "~/lib/actions/partition";
import { formatDecisionLabel } from "~/lib/decision-label";

/**
 * The inbox's "Waiting on me" tab: everything across the user's workspaces
 * that is blocked on them to act. Four kinds, each with its own WHERE
 * builder so the list and the sidebar badge count the same set:
 *
 * - **Decisions** still OPEN or PROPOSED that the user owns or is a decider
 *   on (confirmed only, through the decision resolver).
 * - **Draft decisions to review** — meetings the user owns with AI-extracted
 *   drafts awaiting confirm/reject (the same person the "draft decisions to
 *   review" notification goes to).
 * - **QA tickets** that are theirs to promote — the `yourWork.waitingOnYou`
 *   rule, widened to every workspace they belong to.
 * - **Overdue actions** — the `/today` overdue bucket (ADR-0034).
 */

/** Rows per kind the tab renders; counts are always the full totals. */
export const WAITING_ROW_CAP = 20;

/** Decision statuses that still need someone to decide. */
const UNDECIDED_STATUSES = ["OPEN", "PROPOSED"] as const;

export function decisionsAwaitingMeWhere(
  userId: string,
): Prisma.DecisionWhereInput {
  return {
    AND: [
      buildDecisionAccessWhereAcrossWorkspaces(userId),
      { status: { in: [...UNDECIDED_STATUSES] } },
      { OR: [{ ownerId: userId }, { deciders: { some: { userId } } }] },
    ],
  };
}

/** Meetings the user owns that carry draft decisions awaiting review. */
export function meetingsWithDraftsToReviewWhere(
  userId: string,
): Prisma.TranscriptionSessionWhereInput {
  return { userId, decisions: { some: { reviewState: "DRAFT" } } };
}

/**
 * QA tickets that are the user's to promote — assigned to them, or created
 * by them and unassigned (agent-shipped work commonly has no assignee) — in
 * any workspace they are a member of.
 */
export function qaTicketsWaitingOnMeWhere(
  userId: string,
): Prisma.TicketWhereInput {
  return {
    status: "QA",
    product: { workspace: buildWorkspaceAccessWhere(userId) },
    OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }],
  };
}

export interface WaitingOnMeCounts {
  decisions: number;
  draftReviews: number;
  qaTickets: number;
  overdueActions: number;
  total: number;
}

/** Totals per kind — backs the sidebar badge without loading any rows. */
export async function countWaitingOnMe(
  db: PrismaClient,
  userId: string,
  startOfToday: Date,
): Promise<WaitingOnMeCounts> {
  const [decisions, draftReviews, qaTickets, overdueActions] =
    await Promise.all([
      db.decision.count({ where: decisionsAwaitingMeWhere(userId) }),
      db.transcriptionSession.count({
        where: meetingsWithDraftsToReviewWhere(userId),
      }),
      db.ticket.count({ where: qaTicketsWaitingOnMeWhere(userId) }),
      db.action.count({ where: myOverdueActionsWhere(userId, startOfToday) }),
    ]);
  return {
    decisions,
    draftReviews,
    qaTickets,
    overdueActions,
    total: decisions + draftReviews + qaTickets + overdueActions,
  };
}

/** The rows for each kind (capped) plus the full counts. */
export async function listWaitingOnMe(
  db: PrismaClient,
  userId: string,
  startOfToday: Date,
) {
  const [counts, decisionRows, meetingRows, ticketRows, actionRows] =
    await Promise.all([
      countWaitingOnMe(db, userId, startOfToday),
      db.decision.findMany({
        where: decisionsAwaitingMeWhere(userId),
        // Oldest first — the longest-open question is the most overdue.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: WAITING_ROW_CAP,
        select: {
          id: true,
          number: true,
          statement: true,
          status: true,
          ownerId: true,
          createdAt: true,
          workspace: { select: { slug: true, name: true } },
        },
      }),
      db.transcriptionSession.findMany({
        where: meetingsWithDraftsToReviewWhere(userId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: WAITING_ROW_CAP,
        select: {
          id: true,
          title: true,
          createdAt: true,
          workspace: { select: { slug: true, name: true } },
          _count: {
            select: { decisions: { where: { reviewState: "DRAFT" } } },
          },
        },
      }),
      db.ticket.findMany({
        where: qaTicketsWaitingOnMeWhere(userId),
        // Oldest first — the longest-waiting item is the most urgent.
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: WAITING_ROW_CAP,
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          prUrl: true,
          updatedAt: true,
          product: {
            select: {
              slug: true,
              name: true,
              funTicketIds: true,
              workspaceId: true,
              workspace: { select: { slug: true, name: true } },
            },
          },
        },
      }),
      // Every overdue row, not a capped page: the tab shows them in the
      // partition's priority-then-oldest order, which the DB can't sort by.
      db.action.findMany({
        where: myOverdueActionsWhere(userId, startOfToday),
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          scheduledStart: true,
          dueDate: true,
          projectId: true,
          project: {
            select: {
              name: true,
              workspace: { select: { slug: true, name: true } },
            },
          },
          workspace: { select: { slug: true, name: true } },
        },
      }),
    ]);

  // A merged PR on a ticket still in QA is the strongest "promote this"
  // signal (see yourWork.waitingOnYou). Matched per workspace, since the
  // webhook rows are stored per workspace.
  const prUrls = ticketRows
    .map((t) => t.prUrl)
    .filter((url): url is string => !!url);
  const mergedRows = prUrls.length
    ? await db.gitHubActivity.findMany({
        where: {
          workspaceId: {
            in: [...new Set(ticketRows.map((t) => t.product.workspaceId))],
          },
          prUrl: { in: prUrls },
          prState: "merged",
        },
        select: { workspaceId: true, prUrl: true },
        distinct: ["workspaceId", "prUrl"],
      })
    : [];
  const merged = new Set(mergedRows.map((r) => `${r.workspaceId} ${r.prUrl}`));

  const overdue = partitionActions(actionRows, { today: startOfToday }).overdue;

  return {
    counts,
    decisions: decisionRows.map(({ number, ownerId, ...d }) => ({
      ...d,
      label: formatDecisionLabel(number),
      isOwner: ownerId === userId,
    })),
    draftReviews: meetingRows.map(({ _count, ...m }) => ({
      ...m,
      draftCount: _count.decisions,
    })),
    qaTickets: ticketRows.map(({ prUrl, product, ...t }) => ({
      ...t,
      product: {
        slug: product.slug,
        name: product.name,
        funTicketIds: product.funTicketIds,
      },
      workspace: product.workspace,
      prMerged: !!prUrl && merged.has(`${product.workspaceId} ${prUrl}`),
    })),
    overdueActions: overdue.slice(0, WAITING_ROW_CAP).map((a) => ({
      id: a.id,
      name: a.name,
      scheduledStart: a.scheduledStart,
      dueDate: a.dueDate,
      projectName: a.project?.name ?? null,
      workspace: a.workspace ?? a.project?.workspace ?? null,
    })),
  };
}

export type WaitingOnMe = Awaited<ReturnType<typeof listWaitingOnMe>>;
