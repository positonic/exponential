import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildDecisionAccessWhereAcrossWorkspaces,
  buildProjectAccessWhere,
  buildWorkspaceAccessWhere,
  canEditDecision,
  getDecisionAccess,
} from "~/server/services/access";
import { myOverdueActionsWhere } from "~/server/services/actions/myActionsWhere";
import { buildActionAccessWhere } from "~/server/services/access";
import { compareOverdue } from "~/lib/actions/partition";
import { formatDecisionLabel } from "~/lib/decision-label";

/**
 * The inbox's "Waiting on me" tab: everything across the user's workspaces
 * that is blocked on them to act. Five kinds, each with its own WHERE
 * builder so the list and the sidebar badge count the same set:
 *
 * - **Decisions** still OPEN or PROPOSED that the user owns or is a decider
 *   on (confirmed only, through the decision resolver).
 * - **Draft decisions to review** — meetings the user owns with AI-extracted
 *   drafts awaiting confirm/reject (the same person the "draft decisions to
 *   review" notification goes to), and meeting-less drafts an agent logged
 *   for them: by their own Assistant / External agent, or by Zoe acting as
 *   them (`source: AGENT`).
 * - **QA tickets** that are theirs to promote — the `yourWork.waitingOnYou`
 *   rule, widened to every workspace they belong to.
 * - **Overdue actions** — the `/today` overdue bucket (ADR-0034).
 */

/** Rows per kind the tab renders; counts are always the full totals. */
export const WAITING_ROW_CAP = 20;

/**
 * How many overdue rows are loaded to pick the tab's first rows from. The
 * priority order can't be expressed in SQL, so it's applied in memory to
 * the oldest rows; a backlog bigger than this still counts in full.
 */
export const OVERDUE_WINDOW = 500;

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

/**
 * Meetings the user owns that carry draft decisions awaiting review.
 * Archived meetings are out, as on every other meeting surface — archiving
 * is how a user says "done with this", so its drafts must not pin the badge.
 */
export function meetingsWithDraftsToReviewWhere(
  userId: string,
): Prisma.TranscriptionSessionWhereInput {
  return {
    userId,
    archivedAt: null,
    decisions: { some: { reviewState: "DRAFT" } },
  };
}

/**
 * Meeting-less draft decisions an agent logged that are the user's to
 * confirm or reject: authored by an agent they own, or by Zoe acting as them.
 * Meeting drafts are reviewed per meeting (above), so they are left out here.
 * Scoped to what the user can still reach — workspace membership, and the
 * project when there is one.
 */
export function agentDraftsToReviewWhere(
  userId: string,
): Prisma.DecisionWhereInput {
  return {
    AND: [
      { reviewState: "DRAFT", transcriptionSessionId: null },
      {
        OR: [
          { createdById: userId },
          { createdBy: { externalAgentShadow: { ownerId: userId } } },
        ],
      },
      { workspace: buildWorkspaceAccessWhere(userId) },
      { OR: [{ projectId: null }, { project: buildProjectAccessWhere(userId) }] },
    ],
  };
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

interface PrRef {
  prUrl: string | null;
  workspaceId: string;
}

/**
 * Which tickets' PRs have merged — the strongest "promote this" signal for a
 * ticket still in QA, especially while the QA→DONE merge hook is unreliable.
 * Joins `Ticket.prUrl` against stored GitHubActivity webhook rows, matched
 * per workspace since those rows are stored per workspace. One query, and
 * none when no ticket has a PR. Shared by the inbox and `yourWork`.
 */
export async function mergedPrLookup(
  db: PrismaClient,
  tickets: PrRef[],
): Promise<(ticket: PrRef) => boolean> {
  const prUrls = tickets
    .map((t) => t.prUrl)
    .filter((url): url is string => !!url);
  const mergedRows = prUrls.length
    ? await db.gitHubActivity.findMany({
        where: {
          workspaceId: { in: [...new Set(tickets.map((t) => t.workspaceId))] },
          prUrl: { in: prUrls },
          prState: "merged",
        },
        select: { workspaceId: true, prUrl: true },
        distinct: ["workspaceId", "prUrl"],
      })
    : [];
  const merged = new Set(mergedRows.map((r) => `${r.workspaceId} ${r.prUrl}`));
  return (t) => !!t.prUrl && merged.has(`${t.workspaceId} ${t.prUrl}`);
}

/**
 * Assistant questions (ADR-0067): the latest run of one of MY Assistants on an
 * action is waiting on me — it asked by comment and paused. "Latest" means no
 * resume run has been created from it (`successors: none`); my reply on the
 * action creates one and the question leaves this list.
 */
export function assistantQuestionsWaitingOnMeWhere(userId: string): Prisma.AgentRunWhereInput {
  return {
    status: "WAITING_ON_OWNER",
    agent: { ownerId: userId },
    successors: { none: {} },
    // Owning the Assistant is not a read grant on the action (same rule as
    // the Delegated tab): a revoked membership takes the question with it.
    action: buildActionAccessWhere(userId),
  };
}

export interface WaitingOnMeCounts {
  decisions: number;
  draftReviews: number;
  agentDrafts: number;
  qaTickets: number;
  overdueActions: number;
  assistantQuestions: number;
  total: number;
}

/** Totals per kind — backs the sidebar badge without loading any rows. */
export async function countWaitingOnMe(
  db: PrismaClient,
  userId: string,
  startOfToday: Date,
): Promise<WaitingOnMeCounts> {
  const [decisions, draftReviews, agentDrafts, qaTickets, overdueActions, assistantQuestions] =
    await Promise.all([
      db.decision.count({ where: decisionsAwaitingMeWhere(userId) }),
      db.transcriptionSession.count({
        where: meetingsWithDraftsToReviewWhere(userId),
      }),
      db.decision.count({ where: agentDraftsToReviewWhere(userId) }),
      db.ticket.count({ where: qaTicketsWaitingOnMeWhere(userId) }),
      db.action.count({ where: myOverdueActionsWhere(userId, startOfToday) }),
      db.agentRun.count({ where: assistantQuestionsWaitingOnMeWhere(userId) }),
    ]);
  return {
    decisions,
    draftReviews,
    agentDrafts,
    qaTickets,
    overdueActions,
    assistantQuestions,
    total:
      decisions + draftReviews + agentDrafts + qaTickets + overdueActions + assistantQuestions,
  };
}

/** The rows for each kind (capped) plus the full counts. */
export async function listWaitingOnMe(
  db: PrismaClient,
  userId: string,
  startOfToday: Date,
) {
  const [counts, decisionRows, meetingRows, agentDraftRows, ticketRows, actionRows, questionRows] =
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
      db.decision.findMany({
        where: agentDraftsToReviewWhere(userId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: WAITING_ROW_CAP,
        select: {
          id: true,
          number: true,
          statement: true,
          createdAt: true,
          workspaceId: true,
          projectId: true,
          workspace: { select: { slug: true, name: true } },
          createdBy: { select: { name: true, isAgent: true } },
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
      // A bounded window of the oldest overdue rows, re-sorted in memory
      // into the /today order (priority isn't sortable in SQL).
      db.action.findMany({
        where: myOverdueActionsWhere(userId, startOfToday),
        orderBy: [
          { scheduledStart: { sort: "asc", nulls: "last" } },
          { dueDate: { sort: "asc", nulls: "last" } },
          { id: "asc" },
        ],
        take: OVERDUE_WINDOW,
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
      db.agentRun.findMany({
        where: assistantQuestionsWaitingOnMeWhere(userId),
        // Oldest question first — it has waited longest.
        orderBy: [{ lastEventAt: "asc" }, { id: "asc" }],
        take: WAITING_ROW_CAP,
        select: {
          id: true,
          lastEventAt: true,
          createdAt: true,
          agent: { select: { name: true, assistant: { select: { emoji: true } } } },
          action: {
            select: {
              id: true,
              name: true,
              workspace: { select: { slug: true, name: true } },
              project: { select: { name: true, workspace: { select: { slug: true, name: true } } } },
            },
          },
        },
      }),
    ]);

  const isMerged = await mergedPrLookup(
    db,
    ticketRows.map((t) => ({ prUrl: t.prUrl, workspaceId: t.product.workspaceId })),
  );

  // Confirm is gated like the draft's own banner: on edit access to the
  // decision. These drafts are meeting-less, so access turns on the workspace
  // role and the project alone — resolve each pair once.
  const editableByScope = new Map<string, Promise<boolean>>();
  const agentDraftEditable = await Promise.all(
    agentDraftRows.map((row) => {
      const key = `${row.workspaceId}:${row.projectId ?? ""}`;
      let editable = editableByScope.get(key);
      if (!editable) {
        editable = getDecisionAccess(db, userId, {
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          reviewState: "DRAFT",
          transcriptionSession: null,
        }).then(canEditDecision);
        editableByScope.set(key, editable);
      }
      return editable;
    }),
  );

  // The WHERE already selected exactly the overdue set on the viewer's day;
  // only order it. Re-bucketing with partitionActions would re-derive "today"
  // in the server's timezone and drop rows the count includes.
  const overdue = [...actionRows].sort(compareOverdue);

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
    agentDrafts: agentDraftRows.map(({ number, createdBy, ...d }, index) => ({
      ...d,
      label: formatDecisionLabel(number),
      canEdit: agentDraftEditable[index] ?? false,
      // Your own Assistant is named; a draft Zoe logged as you is "Zoe".
      authorName: createdBy.isAgent ? (createdBy.name ?? "Your assistant") : "Zoe",
    })),
    qaTickets: ticketRows.map(({ prUrl, product, ...t }) => ({
      ...t,
      product: {
        slug: product.slug,
        name: product.name,
        funTicketIds: product.funTicketIds,
      },
      workspace: product.workspace,
      prMerged: isMerged({ prUrl, workspaceId: product.workspaceId }),
    })),
    overdueActions: overdue.slice(0, WAITING_ROW_CAP).map((a) => ({
      id: a.id,
      name: a.name,
      scheduledStart: a.scheduledStart,
      dueDate: a.dueDate,
      projectName: a.project?.name ?? null,
      workspace: a.workspace ?? a.project?.workspace ?? null,
    })),
    assistantQuestions: questionRows.map((r) => ({
      id: r.id,
      askedAt: r.lastEventAt ?? r.createdAt,
      assistantName: r.agent.assistant?.emoji ? `${r.agent.assistant.emoji} ${r.agent.name}` : r.agent.name,
      action: {
        id: r.action.id,
        name: r.action.name,
        projectName: r.action.project?.name ?? null,
        workspace: r.action.workspace ?? r.action.project?.workspace ?? null,
      },
    })),
  };
}

export type WaitingOnMe = Awaited<ReturnType<typeof listWaitingOnMe>>;
