import type { PrismaClient } from "@prisma/client";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { AGENT_RUN_SOURCE } from "~/server/services/timeEntry/dayReport";

/**
 * What happens once a run reaches a terminal status (ADR-0067, Agent PRD
 * D4 step 5, D8, D9): one `agent_run` Notification to the requester and the
 * owner (deduped when they are the same person), a workspace activity event,
 * and — for a run that actually worked — an Agent-run Time entry on the
 * action for the run's wall-clock, owned by the owner and authored by the
 * Assistant (ADR-0061). Idempotent on the time entry via
 * `@@unique([userId, sourceRef])`, and best-effort throughout: a failed
 * side effect never un-finishes the run.
 *
 * WAITING_ON_OWNER is not a finish: its notification is the Mention the
 * ask-owner comment emits.
 */
export async function onRunFinished(db: PrismaClient, runId: string): Promise<void> {
  const run = await db.agentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      actionId: true,
      startedAt: true,
      finishedAt: true,
      summary: true,
      agent: { select: { id: true, ownerId: true, shadowUserId: true } },
      action: { select: { workspaceId: true, project: { select: { workspaceId: true } } } },
    },
  });
  if (!run) return;
  if (run.status === "QUEUED" || run.status === "RUNNING" || run.status === "WAITING_ON_OWNER") return;

  const outcome = run.status === "SUCCEEDED" ? "finished" : "stopped";
  const workspaceId = run.action.workspaceId ?? run.action.project?.workspaceId ?? null;

  await emitNotification({
    category: NOTIFICATION_CATEGORIES.AGENT_RUN,
    actorUserId: run.agent.shadowUserId,
    subject: { runId: run.id, actionId: run.actionId, outcome },
    db,
  }).catch((err: unknown) => {
    console.error("[agentRuns] finish notification failed:", err);
  });

  if (workspaceId) {
    await recordActivity(db, {
      workspaceId,
      userId: run.agent.shadowUserId,
      entityType: "agent_run",
      entityId: run.id,
      action: run.status === "SUCCEEDED" ? "completed" : "failed",
      metadata: { actionId: run.actionId, status: run.status, summary: run.summary?.slice(0, 200) ?? null },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  // Agent-run time: only a run that ran (a cancelled queue entry has no wall-clock).
  if (run.startedAt && run.finishedAt && run.status !== "CANCELLED") {
    const sourceRef = `agent-run:${run.id}`;
    await db.timeEntry
      .upsert({
        where: { userId_sourceRef: { userId: run.agent.ownerId, sourceRef } },
        create: {
          userId: run.agent.ownerId,
          actionId: run.actionId,
          workspaceId,
          startedAt: run.startedAt,
          endedAt: run.finishedAt,
          status: "PROPOSED",
          source: AGENT_RUN_SOURCE,
          sourceRef,
          createdByAgentId: run.agent.id,
          note: run.summary?.split("\n")[0]?.slice(0, 200) ?? null,
        },
        update: {},
      })
      .catch((err: unknown) => {
        console.error("[agentRuns] time entry failed:", err);
      });
  }
}
