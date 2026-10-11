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
import { recordActivity, type ActivityAction } from "~/server/services/activity/recordActivity";
import { formatDecisionLabel } from "~/lib/decision-label";
import { parseEvidence, type DecisionEvidenceTurn } from "~/lib/decision-evidence";
// Imported from the resolver module rather than the access barrel: the
// barrel pulls in the Prisma singleton at module load.
import { canEditDecision, getDecisionAccess } from "~/server/services/access/resolvers/decisionResolver";
import { buildActionEditWhere } from "~/server/services/access/resolvers/actionResolver";

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
  /**
   * "Implemented by" actions staged in the create form. The caller checks
   * they belong to the workspace before handing them over (the same
   * contract every other id on this input has).
   */
  actionIds?: string[];
  /**
   * Born as a draft awaiting a person's confirmation rather than confirmed by
   * its creator. The router sets it for agent-authored decisions: an agent
   * may propose a decision, never publish one it "confirmed" itself.
   */
  asDraft?: boolean;
  /** The creator is an agent principal, so never defaults in as a decider. */
  creatorIsAgent?: boolean;
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
    // A resolution draft points at its target through `supersededById`
    // until confirm; it is not a superseded decision and must not list here.
    where: { reviewState: "CONFIRMED" },
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
      // Everything the shared Actions block renders for a row.
      action: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          kanbanStatus: true,
          priority: true,
          dueDate: true,
          projectId: true,
          assignees: {
            select: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.DecisionInclude;

/** The scope columns a decision can point at; each must live in the workspace. */
export interface DecisionScopeInput {
  productId?: string | null;
  projectId?: string | null;
  goalId?: number | null;
  keyResultId?: string | null;
  adrDocumentId?: string | null;
}

/**
 * Refuse scope ids from outside the workspace. Only ids actually supplied
 * are checked (null clears, undefined leaves alone), so a meeting's own
 * project — already workspace-bound — never round-trips.
 */
/** A user belongs to the workspace directly or through one of its teams. */
async function isWorkspaceMember(db: PrismaClient, workspaceId: string, userId: string): Promise<boolean> {
  const direct = await db.workspaceUser.findFirst({ where: { workspaceId, userId }, select: { id: true } });
  if (direct) return true;
  const viaTeam = await db.teamUser.findFirst({ where: { userId, team: { workspaceId } }, select: { id: true } });
  return Boolean(viaTeam);
}

export async function assertScopeInWorkspace(
  db: PrismaClient,
  workspaceId: string,
  scope: DecisionScopeInput & { ownerId?: string | null; deciders?: DecisionDeciderInput[] | null },
) {
  const missing = (what: string) =>
    new TRPCError({ code: "NOT_FOUND", message: `${what} not found in this workspace` });
  // People are scoped too: an owner or a linked decider must be a member of
  // the workspace, or the header and owner filters would name outsiders.
  if (scope.ownerId) {
    if (!(await isWorkspaceMember(db, workspaceId, scope.ownerId))) throw missing("Owner");
  }
  for (const decider of scope.deciders ?? []) {
    if (decider.userId && !(await isWorkspaceMember(db, workspaceId, decider.userId))) {
      throw missing("Decider");
    }
  }
  if (scope.productId) {
    const row = await db.product.findFirst({
      where: { id: scope.productId, workspaceId },
      select: { id: true },
    });
    if (!row) throw missing("Product");
  }
  if (scope.projectId) {
    const row = await db.project.findFirst({
      where: { id: scope.projectId, workspaceId },
      select: { id: true },
    });
    if (!row) throw missing("Project");
  }
  if (scope.goalId !== undefined && scope.goalId !== null) {
    const row = await db.goal.findFirst({
      where: { id: scope.goalId, workspaceId },
      select: { id: true },
    });
    if (!row) throw missing("Objective");
  }
  if (scope.keyResultId) {
    const row = await db.keyResult.findFirst({
      where: { id: scope.keyResultId, goal: { workspaceId } },
      select: { id: true },
    });
    if (!row) throw missing("Key result");
  }
  if (scope.adrDocumentId) {
    const row = await db.adrDocument.findFirst({
      where: { id: scope.adrDocumentId, repository: { workspaceId } },
      select: { id: true },
    });
    if (!row) throw missing("ADR");
  }
}

/**
 * Create a decision — confirmed, or a draft when `asDraft` (agent-authored,
 * awaiting a person's confirmation). For a meeting-linked decision the meeting
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

  await assertScopeInWorkspace(db, input.workspaceId, input);

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
  // Two exceptions: an open question has no deciders yet, and an agent
  // principal is never the one who decided.
  if (
    !input.transcriptionSessionId &&
    deciders === null &&
    (input.status === "OPEN" || input.creatorIsAgent)
  ) {
    deciders = [];
  }
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

  const actionIds = [...new Set(input.actionIds ?? [])];

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
        reviewState: input.asDraft ? "DRAFT" : "CONFIRMED",
        source,
        decidedAt,
        ownerId: input.ownerId ?? null,
        createdById: input.createdById,
        // A draft is confirmed later by the person who reviews it
        // (`confirmDraft` stamps them), never by its author up front.
        confirmedById: input.asDraft ? null : input.createdById,
        confirmedAt: input.asDraft ? null : new Date(),
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
        // Actions linked in the create form land with the decision, so a
        // half-written decision can never outlive a failed link.
        links: actionIds.length
          ? {
              create: actionIds.map((actionId) => ({
                actionId,
                createdById: input.createdById,
              })),
            }
          : undefined,
      },
      include: decisionDetailInclude,
    });
  });

  // The feed is filtered on workspaceId alone, so a draft's statement would
  // leak to people who may not see it. `confirmDraft` records the event.
  if (input.asDraft) return decision;

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
  // "Formalised as" — lets the graph draw the Decision → ADR edge.
  adrDocumentId: true,
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
  /** One decision by its workspace sequence number — resolves a `D-0003` label. */
  number?: number;
  /**
   * Bound the page. Unset keeps the historical uncapped behaviour for the
   * Decision Log, which renders the whole list; API callers looking one
   * decision up should always pass this.
   */
  limit?: number;
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
        filter.number !== undefined ? { number: filter.number } : {},
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
    ...(filter.limit !== undefined ? { take: filter.limit } : {}),
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
    select: {
      ...decisionListSelect,
      reviewState: true,
      body: true,
      // A draft that resolves an open decision points at it through
      // `supersededById` until confirm applies the status change (V2), so
      // the review surfaces name the target.
      supersededBy: { select: { id: true, number: true, statement: true, status: true } },
    },
    orderBy: [{ number: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    label: formatDecisionLabel(row.number),
    evidenceCount: Array.isArray(row.evidence) ? row.evidence.length : 0,
    supersededBy: row.supersededBy
      ? {
          id: row.supersededBy.id,
          label: formatDecisionLabel(row.supersededBy.number),
          statement: row.supersededBy.statement,
          status: row.supersededBy.status,
        }
      : null,
  }));
}

export interface CreateDraftDecisionInput {
  workspaceId: string;
  /**
   * A number already taken from the workspace sequence by
   * {@link reserveDecisionNumbers}. Omit to take one here.
   */
  number?: number;
  createdById: string;
  transcriptionSessionId: string;
  statement: string;
  body?: string | null;
  status?: DecisionStatus;
  decidedAt?: Date | null;
  occurrenceId?: string | null;
  projectId?: string | null;
  deciders?: DecisionDeciderInput[];
  evidence?: DecisionEvidenceTurn[];
  /**
   * An OPEN/PROPOSED decision this draft resolves. Stored on `supersededById`
   * while the row is a draft; `confirmDraft` then applies the status change
   * to that decision instead of publishing a new one.
   */
  resolvesDecisionId?: string | null;
}

/**
 * Persist one extracted draft (V2 extraction). Drafts take a label from the
 * same workspace sequence as confirmed decisions so a confirmed draft keeps
 * the number it was reviewed under; `reviewState: DRAFT` keeps it out of the
 * log and every count until a person confirms (ADR-0060). No per-row
 * activity event: a draft is invisible to everyone but the meeting's
 * editors, so the feed would leak it — the extraction run records one
 * meeting-level event instead.
 */
export async function createDraftDecision(db: PrismaClient, input: CreateDraftDecisionInput) {
  return db.$transaction((tx) => createDraftDecisionInTx(tx, input));
}

/**
 * The body of {@link createDraftDecision}, taking a transaction client so a
 * caller that already has one can write several drafts atomically.
 *
 * Prisma's `TransactionClient` has no `$transaction` of its own — interactive
 * transactions do not nest — so a caller inside one MUST use this rather than
 * passing its `tx` to the wrapper above. A `mockDeep<PrismaClient>()` happily
 * answers `$transaction` on the mocked `tx`, so that mistake type-checks, runs
 * green in unit tests, and only fails against a real database.
 */
/**
 * Take `count` consecutive numbers from the workspace sequence in ONE
 * statement and hand them back.
 *
 * Writing a batch of drafts used to increment the counter once per row, so a
 * run of twenty drafts spent forty sequential round trips inside a single
 * interactive transaction — enough to blow Prisma's 5 s budget against a
 * production database even though the work itself is trivial. The increment
 * is atomic either way; doing it once is simply half the traffic and none of
 * the sequencing.
 */
export async function reserveDecisionNumbers(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  count: number,
): Promise<number[]> {
  if (count <= 0) return [];
  const { decisionCounter } = await tx.workspace.update({
    where: { id: workspaceId },
    data: { decisionCounter: { increment: count } },
    select: { decisionCounter: true },
  });
  // `decisionCounter` is now the LAST number of the reserved block.
  const first = decisionCounter - count + 1;
  return Array.from({ length: count }, (_, i) => first + i);
}

export async function createDraftDecisionInTx(
  tx: Prisma.TransactionClient,
  input: CreateDraftDecisionInput,
) {
  const deciders = normaliseDeciders(input.deciders ?? []);
  const evidence = (input.evidence ?? []).map((turn) => ({
    turnIndex: turn.turnIndex,
    speaker: turn.speaker ?? null,
    startTime: turn.startTime ?? null,
    text: turn.text,
  }));
  {
    // A caller writing a batch reserves the whole block up front and passes
    // each number in; a lone caller takes one here.
    const number =
      input.number ?? (await reserveDecisionNumbers(tx, input.workspaceId, 1))[0]!;
    return tx.decision.create({
      data: {
        workspaceId: input.workspaceId,
        number,
        statement: input.statement.trim(),
        body: input.body?.trim() ? input.body : null,
        status: input.status ?? "ACCEPTED",
        reviewState: "DRAFT",
        source: "MEETING",
        decidedAt: input.decidedAt ?? null,
        createdById: input.createdById,
        transcriptionSessionId: input.transcriptionSessionId,
        occurrenceId: input.occurrenceId ?? null,
        projectId: input.projectId ?? null,
        supersededById: input.resolvesDecisionId ?? null,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        deciders: deciders.length
          ? {
              create: deciders.map((d) => ({
                userId: d.userId ?? null,
                name: d.name,
                email: d.email ?? null,
              })),
            }
          : undefined,
      },
      select: { id: true, number: true, statement: true, supersededById: true },
    });
  }
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

/** The activity action a move into `status` records, so the feed reads as a lifecycle. */
function statusActivityAction(status: DecisionStatus): ActivityAction {
  switch (status) {
    case "ACCEPTED":
      return "accepted";
    case "SUPERSEDED":
      return "superseded";
    case "DEPRECATED":
      return "deprecated";
    default:
      return "status_changed";
  }
}

/** Who currently stands behind a decision, as the decider claim needs it. */
const deciderClaimSelect = {
  deciders: { select: { userId: true, user: { select: { isAgent: true } } } },
} satisfies Prisma.DecisionSelect;

interface ExistingDecider {
  userId: string | null;
  user: { isAgent: boolean } | null;
}

/**
 * A person who accepts a decision that no person stands behind becomes its
 * decider (CONTEXT.md "Decision"). Agents log decisions as drafts
 * with no decider (ADR-0070), and decisions logged before that rule may name
 * the agent itself; either way the person accepting it is the one who
 * decided. Human deciders already named — including external meeting
 * participants, who have no account — are left alone.
 *
 * Returns the nested `deciders` write for the caller's own status update, so
 * the claim lands in the same write as the transition, or undefined when
 * nothing changes. Only a person acting through their own login claims:
 * `actorIsAgent` is the caller's knowledge from the token (an agent key, or
 * Zoe acting for the person), and the user row's `isAgent` flag is checked
 * here as well, so every caller gets the same answer.
 */
async function claimDeciderWrite(
  db: PrismaClient,
  actor: { userId: string; actorIsAgent?: boolean },
  existing: ExistingDecider[],
): Promise<Prisma.DecisionUpdateInput["deciders"]> {
  if (actor.actorIsAgent) return undefined;
  const person = await db.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, name: true, email: true, isAgent: true },
  });
  if (!person || person.isAgent) return undefined;
  // A decider with no account is an external meeting participant — a person.
  if (existing.some((decider) => decider.user?.isAgent !== true)) return undefined;
  const [decider] = normaliseDeciders([
    { userId: person.id, name: person.name ?? person.email ?? "Unknown", email: person.email },
  ]);
  if (!decider) return undefined;
  return {
    // Only agent principals are left here; the person replaces them.
    ...(existing.length > 0 ? { deleteMany: {} } : {}),
    create: [{ userId: decider.userId ?? null, name: decider.name, email: decider.email ?? null }],
  };
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
  /** "Formalised as": the git-projected ADR this decision became (ADR-0060). */
  adrDocumentId?: string | null;
}

/** Edit a decision's content and scope. Status has its own path (`setStatus`). */
export async function updateDecision(
  db: PrismaClient,
  input: { decisionId: string; workspaceId: string; userId: string; patch: UpdateDecisionPatch },
) {
  const { patch } = input;
  await assertScopeInWorkspace(db, input.workspaceId, patch);
  // Defence in depth (house rule: data is workspace-scoped): the row is
  // addressed by id AND workspace, so a caller that skipped the scoped
  // pre-load cannot reach across workspaces.
  const decision = await db.decision.update({
    where: { id: input.decisionId, workspaceId: input.workspaceId },
    data: {
      ...(patch.statement !== undefined ? { statement: patch.statement.trim() } : {}),
      ...(patch.body !== undefined ? { body: patch.body?.trim() ? patch.body : null } : {}),
      ...(patch.decidedAt !== undefined ? { decidedAt: patch.decidedAt } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
      ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      ...(patch.keyResultId !== undefined ? { keyResultId: patch.keyResultId } : {}),
      ...(patch.adrDocumentId !== undefined ? { adrDocumentId: patch.adrDocumentId } : {}),
    },
    include: decisionDetailInclude,
  });
  // Only confirmed decisions reach the feed. `createDraftDecision` writes no
  // event for exactly this reason — the feed is filtered on workspaceId with
  // no per-entity resolver, so an event here would show an unreviewed (and
  // possibly hallucinated) statement from a restricted meeting to the whole
  // workspace, which is what editing a draft before rejecting it does.
  if (decision.reviewState === "CONFIRMED") {
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
  }
  return decision;
}

export interface SetStatusInput {
  decisionId: string;
  workspaceId: string;
  userId: string;
  status: DecisionStatus;
  /** Required for SUPERSEDED: the confirmed decision in the same workspace that replaces this one. */
  supersededById?: string | null;
  /**
   * The caller knows from the token that an agent is acting — an agent key,
   * or Zoe / a gateway acting on a person's behalf. The service also checks
   * `User.isAgent`; this covers what the user row cannot show.
   */
  actorIsAgent?: boolean;
}

/**
 * Move a confirmed decision along its lifecycle. SUPERSEDED needs the
 * successor (same workspace, confirmed, not itself) and is the only status
 * that keeps `supersededById`; leaving SUPERSEDED clears it. Accepting a
 * decision that has no date stamps it now, and a person accepting one that
 * no person stands behind becomes its decider ({@link claimDeciderWrite}).
 * Each terminal transition records its own activity action (accepted /
 * superseded / deprecated) so the feed reads as a lifecycle; OPEN and
 * PROPOSED are a plain status change.
 */
export async function setStatus(db: PrismaClient, input: SetStatusInput) {
  const current = await db.decision.findFirst({
    where: { id: input.decisionId, workspaceId: input.workspaceId },
    select: { ...transitionSelect, ...deciderClaimSelect },
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

  const deciders =
    input.status === "ACCEPTED"
      ? await claimDeciderWrite(db, input, current.deciders)
      : undefined;

  const decision = await db.decision.update({
    where: { id: current.id, workspaceId: input.workspaceId },
    data: {
      status: input.status,
      supersededById,
      ...(input.status === "ACCEPTED" && !current.decidedAt ? { decidedAt: new Date() } : {}),
      ...(deciders ? { deciders } : {}),
    },
    include: decisionDetailInclude,
  });

  await recordActivity(db, {
    workspaceId: decision.workspaceId,
    userId: input.userId,
    entityType: "decision",
    entityId: decision.id,
    action: statusActivityAction(input.status),
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
 * Confirm a resolution draft: the extractor found that the meeting settled
 * an OPEN or PROPOSED decision, so the draft carries the target on
 * `supersededById`. Confirming applies the status change to that decision
 * — accepted, with the draft's statement and quotes folded into its body
 * and (same meeting) its evidence — and removes the draft row, so the log
 * gains an answer, not a duplicate (ADR-0060 decision 4). A target that is
 * no longer open keeps its status; the draft is still absorbed. An explicit
 * `status` from the reviewer wins over both, and when the result is
 * ACCEPTED the reviewer claims the decider seat if nobody human holds it.
 */
async function applyDraftResolution(
  db: PrismaClient,
  draft: {
    id: string;
    workspaceId: string;
    number: number;
    statement: string;
    body: string | null;
    decidedAt: Date | null;
    supersededById: string;
    transcriptionSessionId: string | null;
    evidence: Prisma.JsonValue;
  },
  userId: string,
  opts: { status?: DecisionStatus; actorIsAgent?: boolean } = {},
) {
  const target = await db.decision.findFirst({
    where: { id: draft.supersededById, workspaceId: draft.workspaceId, reviewState: "CONFIRMED" },
    select: {
      id: true,
      number: true,
      statement: true,
      status: true,
      body: true,
      decidedAt: true,
      transcriptionSessionId: true,
      evidence: true,
      // Resolver columns: the caller was authorized against the DRAFT, which
      // for a meeting-linked draft only proves they can edit that meeting.
      // The target is a different decision, possibly from a meeting they
      // cannot open (ADR-0060 decision 5), and this path both rewrites it and
      // returns its full detail — evidence quotes included.
      projectId: true,
      workspaceId: true,
      reviewState: true,
      transcriptionSession: { select: { id: true, userId: true, projectId: true, workspaceId: true } },
      ...deciderClaimSelect,
    },
  });
  // NOT_FOUND either way, so a target the caller may not see is
  // indistinguishable from one that has been deleted.
  if (!target || !canEditDecision(await getDecisionAccess(db, userId, target))) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The decision this draft resolves is no longer available — reject the draft or log it by hand",
    });
  }

  const draftEvidence = parseEvidence(draft.evidence);
  const sameMeeting =
    draft.transcriptionSessionId !== null && draft.transcriptionSessionId === target.transcriptionSessionId;
  const evidence = sameMeeting
    ? parseEvidence([...parseEvidence(target.evidence), ...draftEvidence])
    : parseEvidence(target.evidence);

  // The answer goes into the body under its own heading. Quotes from another
  // meeting cannot become evidence rows (they would deep-link into the wrong
  // transcript), so they ride along as blockquotes.
  const resolution = [
    "## Resolution",
    draft.statement,
    draft.body?.trim() ? `\n${draft.body.trim()}` : "",
    !sameMeeting && draftEvidence.length > 0
      ? `\n${draftEvidence.map((t) => `> ${t.text}${t.speaker ? ` — ${t.speaker}` : ""}`).join("\n")}`
      : "",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
  const body = target.body?.trim() ? `${target.body.trim()}\n\n${resolution}` : resolution;

  const resolves = target.status === "OPEN" || target.status === "PROPOSED";
  const status: DecisionStatus = opts.status ?? (resolves ? "ACCEPTED" : target.status);
  const statusChanged = status !== target.status;
  // Accepting the answer is deciding it; leaving it open or proposed is not.
  const deciders =
    status === "ACCEPTED"
      ? await claimDeciderWrite(db, { userId, actorIsAgent: opts.actorIsAgent }, target.deciders)
      : undefined;
  const decision = await db.$transaction(async (tx) => {
    const updated = await tx.decision.update({
      where: { id: target.id, workspaceId: draft.workspaceId },
      data: {
        // Leaving SUPERSEDED drops the successor, as `setStatus` does.
        ...(statusChanged ? { status, supersededById: null } : {}),
        body,
        // An open or proposed decision has not been decided, so it gets no
        // decided date; every other outcome keeps or gains one.
        ...(status !== "OPEN" && status !== "PROPOSED"
          ? { decidedAt: target.decidedAt ?? draft.decidedAt ?? new Date() }
          : {}),
        evidence: evidence as unknown as Prisma.InputJsonValue,
        ...(deciders ? { deciders } : {}),
      },
      include: decisionDetailInclude,
    });
    await tx.decision.delete({ where: { id: draft.id, workspaceId: draft.workspaceId } });
    return updated;
  });

  await recordActivity(db, {
    workspaceId: draft.workspaceId,
    userId,
    entityType: "decision",
    entityId: decision.id,
    action: statusChanged ? statusActivityAction(status) : "updated",
    metadata: {
      title: activityTitle(decision),
      label: formatDecisionLabel(decision.number),
      from: target.status,
      to: decision.status,
      resolvedFromDraft: formatDecisionLabel(draft.number),
      transcriptionSessionId: draft.transcriptionSessionId,
    },
  });
  return decision;
}

export interface ConfirmDraftInput {
  decisionId: string;
  workspaceId: string;
  userId: string;
  /**
   * Move the decision to this status in the same call (e.g. confirm as
   * ACCEPTED). SUPERSEDED is refused: it needs a successor, which is
   * `setStatus`'s job.
   */
  status?: DecisionStatus;
  /** See {@link SetStatusInput.actorIsAgent}. */
  actorIsAgent?: boolean;
}

/**
 * Publish a draft, optionally moving it to `status` in the same write. When
 * the result is ACCEPTED, a person confirming a decision that no person
 * stands behind becomes its decider, as {@link setStatus} does; confirming
 * an OPEN or PROPOSED draft is publishing it, not deciding it.
 *
 * Idempotent on the confirm: a confirmed row records nothing — unless a
 * different `status` is asked for, which is then applied exactly as
 * {@link setStatus} would — and only gains a `decidedAt` if it is ACCEPTED
 * without one. Accepting always stamps the date (so a client may call
 * `confirmDraft(id, { status: ACCEPTED })` on any row). A draft that resolves
 * an open decision is applied to that decision instead of being published as
 * a new row (see {@link applyDraftResolution}), and `status` lands on the
 * decision that comes back.
 */
export async function confirmDraft(db: PrismaClient, input: ConfirmDraftInput) {
  if (input.status === "SUPERSEDED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A decision is superseded by choosing its successor — confirm it first, then change its status",
    });
  }
  const current = await db.decision.findFirst({
    where: { id: input.decisionId, workspaceId: input.workspaceId },
    select: { ...transitionSelect, body: true, evidence: true, ...deciderClaimSelect },
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  if (current.reviewState === "CONFIRMED") {
    if (input.status && input.status !== current.status) {
      return setStatus(db, {
        decisionId: current.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        status: input.status,
        actorIsAgent: input.actorIsAgent,
      });
    }
    // An accepted decision always carries the date it was decided; a row
    // confirmed before that was enforced gets it now. No event — nothing
    // the feed would show has changed.
    if (current.status === "ACCEPTED" && !current.decidedAt) {
      return db.decision.update({
        where: { id: current.id, workspaceId: input.workspaceId },
        data: { decidedAt: new Date() },
        include: decisionDetailInclude,
      });
    }
    return db.decision.findUniqueOrThrow({
      where: { id: current.id },
      include: decisionDetailInclude,
    });
  }
  // Rejection is how a reviewer refuses a hallucinated draft, and how the
  // extractor knows not to propose it again. Confirming past it would undo
  // that — and on a resolution draft it would silently rewrite the target.
  if (current.reviewState === "REJECTED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A rejected draft cannot be confirmed — extract again or log the decision by hand",
    });
  }
  if (current.supersededById) {
    return applyDraftResolution(
      db,
      { ...current, supersededById: current.supersededById },
      input.userId,
      { status: input.status, actorIsAgent: input.actorIsAgent },
    );
  }
  const status = input.status ?? current.status;
  const statusChanged = status !== current.status;
  const deciders =
    status === "ACCEPTED" ? await claimDeciderWrite(db, input, current.deciders) : undefined;
  const decision = await db.decision.update({
    where: { id: current.id },
    data: {
      reviewState: "CONFIRMED",
      confirmedById: input.userId,
      confirmedAt: new Date(),
      ...(statusChanged ? { status } : {}),
      // Accepted is decided: stamp the date whether the draft was born
      // ACCEPTED (an agent's usual draft) or is being moved there now.
      ...(status === "ACCEPTED" && !current.decidedAt ? { decidedAt: new Date() } : {}),
      ...(deciders ? { deciders } : {}),
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
  // The status change gets the same lifecycle entry `setStatus` records.
  if (statusChanged) {
    await recordActivity(db, {
      workspaceId: decision.workspaceId,
      userId: input.userId,
      entityType: "decision",
      entityId: decision.id,
      action: statusActivityAction(status),
      metadata: {
        title: activityTitle(decision),
        label: formatDecisionLabel(decision.number),
        from: current.status,
        to: decision.status,
        supersededById: null,
        supersededByLabel: null,
      },
    });
  }
  return decision;
}

/** Reject a draft. A confirmed decision is never rejected — deprecate it. */
export async function rejectDraft(
  db: PrismaClient,
  input: { decisionId: string; workspaceId: string; userId: string },
) {
  const current = await db.decision.findFirst({
    where: { id: input.decisionId, workspaceId: input.workspaceId },
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
export async function deleteDraft(db: PrismaClient, input: { decisionId: string; workspaceId: string }) {
  const current = await db.decision.findFirst({
    where: { id: input.decisionId, workspaceId: input.workspaceId },
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
  await db.decision.delete({ where: { id: current.id, workspaceId: input.workspaceId } });
  return { id: current.id };
}

export interface LinkEntityInput {
  decisionId: string;
  userId: string;
  ticketId?: string | null;
  featureId?: string | null;
  actionId?: string | null;
}

/**
 * "Implemented by": link a ticket, feature or action to a decision
 * (DecisionLink mirrors AdrTicketLink). Idempotent — an existing link is
 * returned, and a race past the findFirst is settled by the DB unique.
 */
export async function linkEntity(db: PrismaClient, input: LinkEntityInput) {
  const where = {
    decisionId: input.decisionId,
    ticketId: input.ticketId ?? null,
    featureId: input.featureId ?? null,
    actionId: input.actionId ?? null,
  };
  const existing = await db.decisionLink.findFirst({ where });
  if (existing) return existing;
  try {
    return await db.decisionLink.create({
      data: { ...where, createdById: input.userId },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await db.decisionLink.findFirst({ where });
      if (raced) return raced;
    }
    throw error;
  }
}

/**
 * A decision that implements exactly one ticket pulls its linked actions
 * into that ticket, so work logged against the decision also shows up in
 * the ticket's own Actions block. Runs whenever either arm of the pair is
 * linked, so the order the user builds the decision in does not matter.
 *
 * Only actions that belong to no ticket are adopted — an action already
 * sitting on another ticket is never moved out from under it, and a
 * decision spanning two tickets has no single right answer, so it adopts
 * nothing. Returns how many actions moved, for the caller to report.
 *
 * Scoped to what `userId` may read: the direct path onto a ticket
 * (`product.ticket.linkAction`) refuses an action the caller does not own,
 * so adoption must not be the looser way in.
 */
export async function adoptDecisionActionsIntoTicket(
  db: PrismaClient,
  decisionId: string,
  userId: string,
): Promise<{ adopted: number; ticketId: string | null }> {
  const links = await db.decisionLink.findMany({
    where: { decisionId },
    select: { ticketId: true, actionId: true },
  });
  const ticketIds = [...new Set(links.map((l) => l.ticketId).filter((id): id is string => !!id))];
  const ticketId = ticketIds.length === 1 ? ticketIds[0]! : null;
  if (!ticketId) return { adopted: 0, ticketId: null };
  const actionIds = links.map((l) => l.actionId).filter((id): id is string => !!id);
  if (actionIds.length === 0) return { adopted: 0, ticketId };
  const { count } = await db.action.updateMany({
    where: { id: { in: actionIds }, ticketId: null, ...buildActionEditWhere(userId) },
    data: { ticketId },
  });
  return { adopted: count, ticketId };
}

/** Remove one implemented-by link. */
export async function unlinkEntity(db: PrismaClient, input: { linkId: string; workspaceId: string }) {
  await db.decisionLink.delete({ where: { id: input.linkId, decision: { workspaceId: input.workspaceId } } });
  return { deleted: true };
}

/**
 * Decisions linked "implemented by" one feature, for the feature page's
 * Decisions section. Goes through the caller's resolver clause like every
 * other bulk read, so drafts and decisions the caller may not see never
 * surface on the feature.
 */
export async function listForFeature(
  db: PrismaClient,
  accessWhere: Prisma.DecisionWhereInput,
  featureId: string,
) {
  const rows = await db.decision.findMany({
    where: { AND: [accessWhere, { links: { some: { featureId } } }] },
    select: decisionListSelect,
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

/**
 * Decisions formalised as one ADR ("Decided in" on the ADR page). Goes
 * through the caller's resolver clause like every other bulk read.
 */
export async function listForAdr(
  db: PrismaClient,
  accessWhere: Prisma.DecisionWhereInput,
  adrDocumentId: string,
) {
  const rows = await db.decision.findMany({
    where: { AND: [accessWhere, { adrDocumentId }] },
    select: decisionListSelect,
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
