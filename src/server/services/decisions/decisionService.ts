/**
 * Decision service — the single write/read seam for Decisions (ADR-0060).
 *
 * The `decision` tRPC router and Zoe's decision tool both call these
 * functions (ADR-0016: agent writes reuse the human path). Access control
 * stays at the call boundary — every function here trusts the ids it is
 * given and the caller is responsible for the resolver check
 * (`src/server/services/access/resolvers/decisionResolver.ts`).
 *
 * Every write records a workspace activity event with entity type
 * `decision`; failures there never break the write (`recordActivity`
 * swallows).
 */

import type {
  DecisionSource,
  DecisionStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { formatDecisionLabel } from "~/lib/decision-label";
import type { DecisionEvidenceTurn } from "~/lib/decision-evidence";

export interface DecisionDeciderInput {
  userId?: string | null;
  name: string;
  email?: string | null;
}

export interface CreateDecisionInput {
  workspaceId: string;
  createdById: string;
  statement: string;
  body?: string | null;
  status?: DecisionStatus;
  source?: DecisionSource;
  decidedAt?: Date | null;
  ownerId?: string | null;
  /** Provenance: the recorded meeting this decision was logged from. */
  transcriptionSessionId?: string | null;
  occurrenceId?: string | null;
  productId?: string | null;
  projectId?: string | null;
  goalId?: number | null;
  keyResultId?: string | null;
  /** When omitted for a meeting-linked decision, the meeting's participants. */
  deciders?: DecisionDeciderInput[];
  evidence?: DecisionEvidenceTurn[];
}

/** Dedupe deciders on email (the DB unique) and drop blank names. */
function normaliseDeciders(deciders: DecisionDeciderInput[]): DecisionDeciderInput[] {
  const seenEmails = new Set<string>();
  const out: DecisionDeciderInput[] = [];
  for (const decider of deciders) {
    const name = decider.name.trim();
    if (!name) continue;
    const email = decider.email?.trim().toLowerCase() ?? null;
    if (email) {
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
    }
    out.push({ userId: decider.userId ?? null, name, email });
  }
  return out;
}

/** The include every detail read uses, so the shape is stable across surfaces. */
export const decisionDetailInclude = {
  owner: { select: { id: true, name: true, email: true, image: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  deciders: {
    select: { id: true, userId: true, name: true, email: true },
    orderBy: { name: "asc" },
  },
  transcriptionSession: {
    select: { id: true, title: true, meetingDate: true, workspaceId: true },
  },
  occurrence: {
    select: {
      id: true,
      scheduledStart: true,
      ceremony: { select: { id: true, name: true, slug: true } },
    },
  },
  product: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, name: true, slug: true } },
  goal: { select: { id: true, title: true } },
  keyResult: { select: { id: true, title: true } },
  supersededBy: { select: { id: true, number: true, statement: true, status: true } },
  supersedes: {
    select: { id: true, number: true, statement: true, status: true },
    orderBy: { number: "asc" },
  },
  adrDocument: {
    select: { id: true, number: true, title: true, repositoryId: true },
  },
  links: {
    include: {
      ticket: {
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          status: true,
          productId: true,
        },
      },
      feature: { select: { id: true, name: true, status: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.DecisionInclude;

/**
 * Create a confirmed decision. For a meeting-linked decision the meeting
 * supplies the defaults the PRD asks for: decided-at = meeting date,
 * deciders = participants, occurrence and project = the meeting's. The
 * label number is taken from `Workspace.decisionCounter` inside the same
 * transaction as the insert, so concurrent creates never share a label
 * (the same pattern `createTicketWithNumber` uses for `Product.ticketCounter`).
 */
export async function createDecision(db: PrismaClient, input: CreateDecisionInput) {
  let decidedAt = input.decidedAt ?? null;
  let deciders = input.deciders ? normaliseDeciders(input.deciders) : null;
  let occurrenceId = input.occurrenceId ?? null;
  let projectId = input.projectId ?? null;
  let source: DecisionSource = input.source ?? "MANUAL";

  if (input.transcriptionSessionId) {
    const meeting = await db.transcriptionSession.findUnique({
      where: { id: input.transcriptionSessionId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        occurrenceId: true,
        meetingDate: true,
        participants: { select: { userId: true, name: true, email: true } },
      },
    });
    if (!meeting) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
    }
    if (meeting.workspaceId !== input.workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The meeting belongs to a different workspace",
      });
    }
    decidedAt ??= meeting.meetingDate ?? null;
    occurrenceId ??= meeting.occurrenceId ?? null;
    projectId ??= meeting.projectId ?? null;
    if (!input.source) source = "MEETING";
    deciders ??= normaliseDeciders(
      meeting.participants.map((p) => ({
        userId: p.userId,
        name: p.name ?? p.email,
        email: p.email,
      })),
    );
  }

  // A decision logged by hand with no deciders named is the creator's own
  // call; Zoe logs on the session user's behalf, so the same default holds.
  if (!input.transcriptionSessionId && deciders === null) {
    const creator = await db.user.findUnique({
      where: { id: input.createdById },
      select: { id: true, name: true, email: true },
    });
    deciders = creator
      ? normaliseDeciders([
          { userId: creator.id, name: creator.name ?? creator.email ?? "Unknown", email: creator.email },
        ])
      : [];
  }

  const evidence = (input.evidence ?? []).map((turn) => ({
    turnIndex: turn.turnIndex,
    speaker: turn.speaker ?? null,
    startTime: turn.startTime ?? null,
    text: turn.text,
  }));

  const decision = await db.$transaction(async (tx) => {
    const counter = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { decisionCounter: { increment: 1 } },
      select: { decisionCounter: true },
    });
    return tx.decision.create({
      data: {
        workspaceId: input.workspaceId,
        number: counter.decisionCounter,
        statement: input.statement.trim(),
        body: input.body?.trim() ? input.body : null,
        status: input.status ?? "PROPOSED",
        reviewState: "CONFIRMED",
        source,
        decidedAt,
        ownerId: input.ownerId ?? null,
        createdById: input.createdById,
        confirmedById: input.createdById,
        confirmedAt: new Date(),
        transcriptionSessionId: input.transcriptionSessionId ?? null,
        occurrenceId,
        productId: input.productId ?? null,
        projectId,
        goalId: input.goalId ?? null,
        keyResultId: input.keyResultId ?? null,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        deciders: deciders?.length
          ? {
              create: deciders.map((d) => ({
                userId: d.userId ?? null,
                name: d.name,
                email: d.email ?? null,
              })),
            }
          : undefined,
      },
      include: decisionDetailInclude,
    });
  });

  await recordActivity(db, {
    workspaceId: input.workspaceId,
    userId: input.createdById,
    entityType: "decision",
    entityId: decision.id,
    action: "created",
    metadata: {
      title: `${formatDecisionLabel(decision.number)} ${decision.statement}`,
      label: formatDecisionLabel(decision.number),
      status: decision.status,
      source: decision.source,
      transcriptionSessionId: decision.transcriptionSessionId,
    },
  });

  return decision;
}

/** The list row shape: enough for the Decision Log and the meeting summary tab. */
export const decisionListSelect = {
  id: true,
  workspaceId: true,
  number: true,
  statement: true,
  status: true,
  source: true,
  decidedAt: true,
  updatedAt: true,
  transcriptionSessionId: true,
  occurrenceId: true,
  productId: true,
  projectId: true,
  supersededById: true,
  evidence: true,
  product: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, name: true, slug: true } },
  occurrence: {
    select: {
      id: true,
      scheduledStart: true,
      ceremony: { select: { id: true, name: true, slug: true } },
    },
  },
  transcriptionSession: { select: { id: true, title: true } },
  supersededBy: { select: { id: true, number: true } },
  _count: { select: { links: true, deciders: true } },
} satisfies Prisma.DecisionSelect;

export interface ListDecisionsFilter {
  statuses?: DecisionStatus[];
  sources?: DecisionSource[];
  /** A product id, or `"workspace"` for decisions with no product. */
  productId?: string;
  /** With a real productId: ALSO include null-product decisions (product lens). */
  includeWorkspaceWide?: boolean;
  projectId?: string;
  /** Free-text search over statement and body. */
  search?: string;
}

/**
 * Confirmed decisions in a workspace the caller may read, newest decided
 * first. `accessWhere` is the resolver's clause for the caller — the router
 * builds it, this function never decides visibility itself.
 */
export async function listForWorkspace(
  db: PrismaClient,
  accessWhere: Prisma.DecisionWhereInput,
  filter: ListDecisionsFilter = {},
) {
  const search = filter.search?.trim();
  const rows = await db.decision.findMany({
    where: {
      AND: [
        accessWhere,
        filter.statuses?.length ? { status: { in: filter.statuses } } : {},
        filter.sources?.length ? { source: { in: filter.sources } } : {},
        filter.productId
          ? filter.productId === "workspace"
            ? { productId: null }
            : filter.includeWorkspaceWide
              ? { OR: [{ productId: filter.productId }, { productId: null }] }
              : { productId: filter.productId }
          : {},
        filter.projectId ? { projectId: filter.projectId } : {},
        search
          ? {
              OR: [
                { statement: { contains: search, mode: "insensitive" } },
                { body: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: decisionListSelect,
    orderBy: [{ decidedAt: { sort: "desc", nulls: "last" } }, { number: "desc" }],
  });
  return rows.map((row) => ({
    ...row,
    label: formatDecisionLabel(row.number),
    evidenceCount: Array.isArray(row.evidence) ? row.evidence.length : 0,
    supersededBy: row.supersededBy
      ? { id: row.supersededBy.id, label: formatDecisionLabel(row.supersededBy.number) }
      : null,
  }));
}

/**
 * Decisions logged from one meeting. Confirmed rows always; drafts only
 * when the caller may edit the meeting (`includeDrafts`), which the router
 * decides through the transcription resolver.
 */
export async function listForMeeting(
  db: PrismaClient,
  transcriptionSessionId: string,
  opts: { includeDrafts: boolean },
) {
  const rows = await db.decision.findMany({
    where: {
      transcriptionSessionId,
      reviewState: opts.includeDrafts ? { in: ["CONFIRMED", "DRAFT"] } : "CONFIRMED",
    },
    select: { ...decisionListSelect, reviewState: true },
    orderBy: [{ number: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    label: formatDecisionLabel(row.number),
    evidenceCount: Array.isArray(row.evidence) ? row.evidence.length : 0,
    supersededBy: row.supersededBy
      ? { id: row.supersededBy.id, label: formatDecisionLabel(row.supersededBy.number) }
      : null,
  }));
}

/** Columns a status or draft transition needs before it decides anything. */
const transitionSelect = {
  id: true,
  workspaceId: true,
  number: true,
  statement: true,
  status: true,
  reviewState: true,
  decidedAt: true,
  supersededById: true,
  source: true,
  transcriptionSessionId: true,
} satisfies Prisma.DecisionSelect;

function activityTitle(decision: { number: number; statement: string }): string {
  return `${formatDecisionLabel(decision.number)} ${decision.statement}`;
}

export interface UpdateDecisionPatch {
  statement?: string;
  body?: string | null;
  decidedAt?: Date | null;
  ownerId?: string | null;
  productId?: string | null;
  projectId?: string | null;
  goalId?: number | null;
  keyResultId?: string | null;
}

/** Edit a decision's content and scope. Status has its own path (`setStatus`). */
export async function updateDecision(
  db: PrismaClient,
  input: { decisionId: string; userId: string; patch: UpdateDecisionPatch },
) {
  const { patch } = input;
  const decision = await db.decision.update({
    where: { id: input.decisionId },
    data: {
      ...(patch.statement !== undefined ? { statement: patch.statement.trim() } : {}),
      ...(patch.body !== undefined ? { body: patch.body?.trim() ? patch.body : null } : {}),
      ...(patch.decidedAt !== undefined ? { decidedAt: patch.decidedAt } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
      ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      ...(patch.keyResultId !== undefined ? { keyResultId: patch.keyResultId } : {}),
    },
    include: decisionDetailInclude,
  });
  await recordActivity(db, {
    workspaceId: decision.workspaceId,
    userId: input.userId,
    entityType: "decision",
    entityId: decision.id,
    action: "updated",
    metadata: {
      title: activityTitle(decision),
      label: formatDecisionLabel(decision.number),
      fields: Object.keys(patch),
    },
  });
  return decision;
}

export interface SetStatusInput {
  decisionId: string;
  userId: string;
  status: DecisionStatus;
  /** Required for SUPERSEDED: the confirmed decision in the same workspace that replaces this one. */
  supersededById?: string | null;
}

/**
 * Move a confirmed decision along its lifecycle. SUPERSEDED needs the
 * successor (same workspace, confirmed, not itself) and is the only status
 * that keeps `supersededById`; leaving SUPERSEDED clears it. Accepting a
 * decision that has no date stamps it now. Each terminal transition records
 * its own activity action (accepted / superseded / deprecated) so the feed
 * reads as a lifecycle; OPEN and PROPOSED are a plain status change.
 */
export async function setStatus(db: PrismaClient, input: SetStatusInput) {
  const current = await db.decision.findUnique({
    where: { id: input.decisionId },
    select: transitionSelect,
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  if (current.reviewState !== "CONFIRMED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Confirm the draft before changing its status",
    });
  }

  let supersededById: string | null = null;
  if (input.status === "SUPERSEDED") {
    if (!input.supersededById) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose the decision that supersedes this one",
      });
    }
    if (input.supersededById === current.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A decision cannot supersede itself",
      });
    }
    const successor = await db.decision.findFirst({
      where: {
        id: input.supersededById,
        workspaceId: current.workspaceId,
        reviewState: "CONFIRMED",
      },
      select: { id: true, number: true },
    });
    if (!successor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Superseding decision not found" });
    }
    supersededById = successor.id;
  }

  const decision = await db.decision.update({
    where: { id: current.id },
    data: {
      status: input.status,
      supersededById,
      ...(input.status === "ACCEPTED" && !current.decidedAt ? { decidedAt: new Date() } : {}),
    },
    include: decisionDetailInclude,
  });

  const action =
    input.status === "ACCEPTED"
      ? "accepted"
      : input.status === "SUPERSEDED"
        ? "superseded"
        : input.status === "DEPRECATED"
          ? "deprecated"
          : "status_changed";
  await recordActivity(db, {
    workspaceId: decision.workspaceId,
    userId: input.userId,
    entityType: "decision",
    entityId: decision.id,
    action,
    metadata: {
      title: activityTitle(decision),
      label: formatDecisionLabel(decision.number),
      from: current.status,
      to: decision.status,
      supersededById,
      supersededByLabel: decision.supersededBy
        ? formatDecisionLabel(decision.supersededBy.number)
        : null,
    },
  });
  return decision;
}

/**
 * Publish a draft (V2 extraction writes drafts; V1 only exposes the seam).
 * Idempotent: confirming a confirmed row returns it unchanged and records
 * nothing.
 */
export async function confirmDraft(
  db: PrismaClient,
  input: { decisionId: string; userId: string },
) {
  const current = await db.decision.findUnique({
    where: { id: input.decisionId },
    select: transitionSelect,
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  if (current.reviewState === "CONFIRMED") {
    return db.decision.findUniqueOrThrow({
      where: { id: current.id },
      include: decisionDetailInclude,
    });
  }
  const decision = await db.decision.update({
    where: { id: current.id },
    data: {
      reviewState: "CONFIRMED",
      confirmedById: input.userId,
      confirmedAt: new Date(),
    },
    include: decisionDetailInclude,
  });
  await recordActivity(db, {
    workspaceId: decision.workspaceId,
    userId: input.userId,
    entityType: "decision",
    entityId: decision.id,
    action: "confirmed",
    metadata: {
      title: activityTitle(decision),
      label: formatDecisionLabel(decision.number),
      status: decision.status,
      source: decision.source,
    },
  });
  return decision;
}

/** Reject a draft. A confirmed decision is never rejected — deprecate it. */
export async function rejectDraft(
  db: PrismaClient,
  input: { decisionId: string; userId: string },
) {
  const current = await db.decision.findUnique({
    where: { id: input.decisionId },
    select: { id: true, reviewState: true },
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  if (current.reviewState === "CONFIRMED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A confirmed decision cannot be rejected — deprecate or supersede it",
    });
  }
  return db.decision.update({
    where: { id: current.id },
    data: { reviewState: "REJECTED" },
    select: { id: true, reviewState: true },
  });
}

/**
 * Hard-delete a draft or rejected row. Confirmed decisions are never
 * deleted (ADR-0060): they are deprecated or superseded so the log keeps
 * its history.
 */
export async function deleteDraft(db: PrismaClient, input: { decisionId: string }) {
  const current = await db.decision.findUnique({
    where: { id: input.decisionId },
    select: { id: true, reviewState: true },
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  if (current.reviewState === "CONFIRMED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Confirmed decisions are never deleted — deprecate or supersede instead",
    });
  }
  await db.decision.delete({ where: { id: current.id } });
  return { id: current.id };
}
