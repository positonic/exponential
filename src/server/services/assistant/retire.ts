import type { Prisma, PrismaClient } from "@prisma/client";

/** Run statuses a retirement stops: still going, or parked on a question. */
const STOPPABLE_RUN_STATUSES = ["QUEUED", "RUNNING", "WAITING_ON_OWNER"] as const;

/** Action statuses whose assignments are history, not open work. */
const CLOSED_ACTION_STATUSES = ["COMPLETED", "CANCELLED"];

export interface RetirementResult {
  /** False when the Assistant was already retired: nothing was written. */
  retired: boolean;
  keysRevoked: number;
  /** Workspace memberships the survivor gained (it may already have held some). */
  membershipsMoved: number;
  /** Position holdings the survivor gained along with those memberships. */
  positionsMoved: number;
  membershipsRemoved: number;
  /** Open assignments the survivor gained (it may already have held some). */
  assignmentsMoved: number;
  assignmentsRemoved: number;
  runsCancelled: number;
}

/**
 * Retire an Assistant (ADR-0072). A person has one Assistant; every other one
 * is retired, never deleted, because `AgentRun.agentId → ExternalAgent` is
 * `onDelete: Cascade` — deleting the principal would destroy every run it
 * performed, with its event log. So retirement:
 *
 *  - stamps `retiredAt` (and drops `isDefault`), keeping the Assistant row, its
 *    External agent and its shadow user, so everything it wrote stays
 *    attributed to it and its persona text survives;
 *  - revokes its keys, so it never authenticates again;
 *  - removes its workspace memberships, so it cannot be assigned anywhere —
 *    moving them, with the Positions held through them, to `survivorId` when
 *    given (a `PositionHolder` row cascades with its membership);
 *  - removes its assignments on open Actions, moving them to the survivor when
 *    given, and **starts no Agent run** for the survivor (nothing is enqueued);
 *    assignments on completed or cancelled Actions stay, as history;
 *  - cancels its live and waiting runs, each with a `status` event saying so.
 *
 * One transaction, idempotent: an already-retired Assistant is left alone. The
 * migration that retires duplicates does the same in SQL
 * (`20261011200100_retire_duplicate_assistants`).
 */
export async function retireAssistant(
  db: PrismaClient,
  input: { assistantId: string; survivorId?: string | null; now?: Date },
): Promise<RetirementResult> {
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const retiring = await tx.assistant.findUniqueOrThrow({
      where: { id: input.assistantId },
      select: {
        id: true,
        createdById: true,
        retiredAt: true,
        externalAgent: { select: { id: true, shadowUserId: true } },
      },
    });
    if (retiring.retiredAt) {
      return {
        retired: false,
        keysRevoked: 0,
        membershipsMoved: 0,
        positionsMoved: 0,
        membershipsRemoved: 0,
        assignmentsMoved: 0,
        assignmentsRemoved: 0,
        runsCancelled: 0,
      };
    }

    const survivorShadowUserId = input.survivorId
      ? await loadSurvivorShadowUser(tx, input.survivorId, retiring)
      : null;
    const { id: agentId, shadowUserId } = retiring.externalAgent;

    await tx.assistant.update({
      where: { id: retiring.id },
      data: { retiredAt: now, isDefault: false },
    });

    const keys = await tx.externalAgentKey.deleteMany({ where: { agentId } });

    // Memberships: the survivor gains each one first, then the retired loses
    // them all. Agents only ever hold `member` (ADR-0049).
    const memberships = await tx.workspaceUser.findMany({
      where: { userId: shadowUserId },
      select: { workspaceId: true, positionHolders: { select: { positionId: true } } },
    });
    let membershipsMoved = 0;
    let positionsMoved = 0;
    if (survivorShadowUserId && memberships.length > 0) {
      membershipsMoved = (
        await tx.workspaceUser.createMany({
          data: memberships.map((m) => ({
            userId: survivorShadowUserId,
            workspaceId: m.workspaceId,
            role: "member",
          })),
          skipDuplicates: true,
        })
      ).count;
      positionsMoved = await movePositionHoldings(tx, memberships, survivorShadowUserId);
    }
    const membershipsRemoved = (
      await tx.workspaceUser.deleteMany({ where: { userId: shadowUserId } })
    ).count;

    // Open assignments move the same way. Written directly, not through
    // `action.assign`, precisely so that no Agent run is enqueued.
    const openAssignments = await tx.actionAssignee.findMany({
      where: { userId: shadowUserId, action: { status: { notIn: CLOSED_ACTION_STATUSES } } },
      select: { id: true, actionId: true },
    });
    const assignmentsMoved = survivorShadowUserId
      ? (
          await tx.actionAssignee.createMany({
            data: openAssignments.map((a) => ({ actionId: a.actionId, userId: survivorShadowUserId })),
            skipDuplicates: true,
          })
        ).count
      : 0;
    const assignmentsRemoved = (
      await tx.actionAssignee.deleteMany({ where: { id: { in: openAssignments.map((a) => a.id) } } })
    ).count;

    const runsCancelled = await cancelRunsOfRetiredAgent(tx, agentId, now);

    return {
      retired: true,
      keysRevoked: keys.count,
      membershipsMoved,
      positionsMoved,
      membershipsRemoved,
      assignmentsMoved,
      assignmentsRemoved,
      runsCancelled,
    };
  });
}

async function loadSurvivorShadowUser(
  tx: Prisma.TransactionClient,
  survivorId: string,
  retiring: { id: string; createdById: string },
): Promise<string> {
  if (survivorId === retiring.id) {
    throw new Error("An Assistant cannot survive its own retirement");
  }
  const survivor = await tx.assistant.findUniqueOrThrow({
    where: { id: survivorId },
    select: { createdById: true, retiredAt: true, externalAgent: { select: { shadowUserId: true } } },
  });
  if (survivor.createdById !== retiring.createdById) {
    throw new Error("The surviving Assistant must belong to the same person");
  }
  if (survivor.retiredAt) {
    throw new Error("The surviving Assistant is itself retired");
  }
  return survivor.externalAgent.shadowUserId;
}

/**
 * Re-point the Positions the retired Assistant held to the survivor's
 * membership in the same workspace (written just before, so it exists).
 */
async function movePositionHoldings(
  tx: Prisma.TransactionClient,
  memberships: Array<{ workspaceId: string; positionHolders: Array<{ positionId: string }> }>,
  survivorShadowUserId: string,
): Promise<number> {
  const held = memberships.filter((m) => m.positionHolders.length > 0);
  if (held.length === 0) return 0;
  const survivorMemberships = await tx.workspaceUser.findMany({
    where: { userId: survivorShadowUserId, workspaceId: { in: held.map((m) => m.workspaceId) } },
    select: { id: true, workspaceId: true },
  });
  const survivorMembershipByWorkspace = new Map(
    survivorMemberships.map((m) => [m.workspaceId, m.id]),
  );
  const data = held.flatMap((m) => {
    const workspaceUserId = survivorMembershipByWorkspace.get(m.workspaceId);
    return workspaceUserId
      ? m.positionHolders.map((h) => ({ positionId: h.positionId, workspaceUserId }))
      : [];
  });
  if (data.length === 0) return 0;
  return (await tx.positionHolder.createMany({ data, skipDuplicates: true })).count;
}

/**
 * Cancel the retired agent's live and waiting runs. Each gets a `status` event
 * at the next `seq` of its log; the update is guarded on the status it read, so
 * a run that finished meanwhile is left as it finished.
 */
async function cancelRunsOfRetiredAgent(
  tx: Prisma.TransactionClient,
  agentId: string,
  now: Date,
): Promise<number> {
  const runs = await tx.agentRun.findMany({
    where: { agentId, status: { in: [...STOPPABLE_RUN_STATUSES] } },
    select: { id: true, status: true },
  });
  let cancelled = 0;
  for (const run of runs) {
    const updated = await tx.agentRun.updateMany({
      where: { id: run.id, status: run.status },
      data: { status: "CANCELLED", finishedAt: now, lastEventAt: now },
    });
    if (updated.count === 0) continue;
    cancelled += 1;
    const last = await tx.agentRunEvent.aggregate({
      where: { runId: run.id },
      _max: { seq: true },
    });
    await tx.agentRunEvent.create({
      data: {
        runId: run.id,
        seq: (last._max.seq ?? 0) + 1,
        kind: "status",
        payload: { status: "CANCELLED", by: "assistant-retired", was: run.status },
      },
    });
  }
  return cancelled;
}
