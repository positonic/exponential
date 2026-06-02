/**
 * Capture module (ticket #2) — the `capture_action` coarse tool's server side.
 *
 * Turns a raw natural-language phrase into a created Action, reusing the
 * existing shared NL parser (`parseActionInput`: date extraction + fuzzy
 * Project resolution + inbox fallback when there is no confident match —
 * `Action.projectId` is nullable). Mirrors the create logic of
 * `action.quickCreate` / `mastra.quickCreateAction` so behaviour stays
 * identical; only the `source` differs ("voice").
 *
 * Capture is non-destructive: it never raises the confirmation gate.
 */
import type { PrismaClient } from "@prisma/client";

import { parseActionInput } from "~/server/services/parsing/parseActionInput";

export interface CapturedAction {
  id: string;
  name: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  project: { id: string; name: string } | null;
}

export interface CaptureResult {
  action: CapturedAction;
  /** True when the action landed in the inbox (no confident Project match). */
  inbox: boolean;
}

/**
 * Parse `phrase` and create an Action for `userId`. Returns the created action
 * and whether it landed in the inbox. Never throws on ambiguous/absent
 * projects — those fall back to the inbox so capture always succeeds.
 */
export async function captureAction(
  phrase: string,
  userId: string,
  db: PrismaClient,
  workspaceId?: string,
): Promise<CaptureResult> {
  const parsed = await parseActionInput(
    phrase,
    userId,
    db,
    workspaceId ? { workspaceId } : undefined,
  );

  // Inherit kanban order from the resolved project (matches the existing
  // quick-create paths). The action belongs to the session's workspace; a
  // matched project's workspace (always the session's, since matching is now
  // scoped above) refines it, and inbox actions still carry the session
  // workspace so "what's in <workspace>?" sees them.
  let kanbanOrder: number | null = null;
  let resolvedWorkspaceId: string | null = workspaceId ?? null;
  if (parsed.projectId) {
    const [highest, proj] = await Promise.all([
      db.action.findFirst({
        where: { projectId: parsed.projectId, kanbanOrder: { not: null } },
        orderBy: { kanbanOrder: "desc" },
        select: { kanbanOrder: true },
      }),
      db.project.findUnique({
        where: { id: parsed.projectId },
        select: { workspaceId: true },
      }),
    ]);
    kanbanOrder = (highest?.kanbanOrder ?? 0) + 1;
    resolvedWorkspaceId = proj?.workspaceId ?? resolvedWorkspaceId;
  }

  const action = await db.action.create({
    data: {
      name: parsed.name,
      projectId: parsed.projectId,
      priority: "Quick",
      status: "ACTIVE",
      createdById: userId,
      scheduledStart: parsed.scheduledStart,
      dueDate: parsed.dueDate,
      source: "voice",
      kanbanStatus: parsed.projectId ? "TODO" : null,
      kanbanOrder,
      workspaceId: resolvedWorkspaceId,
    },
    select: {
      id: true,
      name: true,
      priority: true,
      status: true,
      dueDate: true,
      project: { select: { id: true, name: true } },
    },
  });

  return { action, inbox: action.project === null };
}
