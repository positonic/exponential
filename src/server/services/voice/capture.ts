/**
 * Capture module (ticket #2) — the `capture_action` coarse tool's server side.
 *
 * Turns a raw natural-language phrase into a created Action, reusing the
 * existing shared NL parser (`parseActionInput`: date extraction + fuzzy
 * Project resolution + inbox fallback when there is no confident match —
 * `Action.projectId` is nullable), then creates through the Action write
 * module like `action.quickCreate` / `mastra.quickCreateAction`; only the
 * `source` differs ("voice").
 *
 * Capture is non-destructive: it never raises the confirmation gate. It does
 * apply the Action write gate (ADR-0016): a read-only workspace, or a matched
 * project the user can only view, throws FORBIDDEN, which the voice router
 * turns into a spoken refusal.
 */
import type { PrismaClient } from "@prisma/client";

import { parseActionInput } from "~/server/services/parsing/parseActionInput";
import { createAction } from "~/server/services/actions";

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
 * projects — those fall back to the inbox; only the write gate can refuse.
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

  // The write is the Action module's (ADR-0016: the voice layer applies the
  // same gate as the user's own hands): project edit access when the parser
  // matched a project, otherwise a write role in the session's workspace;
  // the project's workspace wins, the kanban column is seeded, the activity
  // event recorded. Inbox actions still carry the session workspace so
  // "what's in <workspace>?" sees them.
  const created = await createAction(
    { db, actor: { userId, isAdmin: false } },
    {
      name: parsed.name,
      projectId: parsed.projectId ?? undefined,
      workspaceId,
      priority: "Quick",
      status: "ACTIVE",
      scheduledStart: parsed.scheduledStart ?? undefined,
      dueDate: parsed.dueDate ?? undefined,
      source: "voice",
    },
  );

  const action: CapturedAction = {
    id: created.id,
    name: created.name,
    priority: created.priority,
    status: created.status,
    dueDate: created.dueDate,
    project: created.project ? { id: created.project.id, name: created.project.name } : null,
  };

  return { action, inbox: action.project === null };
}
