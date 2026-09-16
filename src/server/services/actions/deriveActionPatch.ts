import type { ActionStatus } from "@prisma/client";
import type { ActionCoarseStatus } from "./schema";

/** The columns the lockstep reads from the stored row. */
export interface ActionPatchCurrent {
  status: string;
  kanbanStatus: ActionStatus | null;
  completedAt: Date | null;
}

/** The columns the lockstep reads from the incoming patch. */
export interface ActionPatchInput {
  status?: ActionCoarseStatus;
  /** A column, or `null` when the Action is leaving its project. */
  kanbanStatus?: ActionStatus | null;
}

export interface ActionPatchTransitions {
  /**
   * The card is moving to a different column, not being re-sent. Clearing
   * the column (`kanbanStatus: null`, leaving a project) is not a move.
   */
  kanbanChanged: boolean;
  /** The coarse status the row will have after the write. */
  nextStatus: string;
  /** The coarse status is actually changing. */
  statusChanged: boolean;
  /** Entering COMPLETED from something else. */
  completing: boolean;
  /** Leaving COMPLETED for something else. */
  uncompleting: boolean;
}

export interface DerivedActionPatch {
  /** Columns to write on top of the caller's patch: `status`, `completedAt`. */
  data: { status?: ActionCoarseStatus; completedAt?: Date | null };
  transitions: ActionPatchTransitions;
}

/** Coarse statuses a kanban move may drive. DRAFT and DELETED never move. */
const SYNCABLE_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "COMPLETED", "CANCELLED"]);

function statusForKanban(kanbanStatus: ActionStatus): ActionCoarseStatus {
  if (kanbanStatus === "DONE") return "COMPLETED";
  if (kanbanStatus === "CANCELLED") return "CANCELLED";
  return "ACTIVE";
}

/**
 * The kanban ⇄ status lockstep, completed-at stamping and legacy backfill,
 * in one pure function. No I/O; exported for tests and `applyActionUpdate`.
 *
 * Rules, with `updateKanbanStatus` as the reference behaviour:
 *
 * - Only the kanban → status direction is synced. Moving a card to DONE
 *   completes the coarse status, to CANCELLED cancels it, and out of DONE on
 *   a real column change reactivates it. Re-sending the current column is a
 *   no-op on `status` and `completedAt`, so an unrelated full-payload edit
 *   cannot resurrect a completed Action.
 * - Toward DONE / CANCELLED the sync fires even without a column change, so
 *   a legacy row whose column already says DONE but whose status never
 *   followed is repaired.
 * - DRAFT and DELETED rows never move through a kanban move.
 * - An explicit `patch.status` always wins over the sync.
 * - `completedAt` is stamped on entering COMPLETED when the row has none
 *   (backfilling legacy DONE-with-null rows), cleared on going back to
 *   ACTIVE or on to CANCELLED and on leaving the DONE column on a real move
 *   (even when the status never followed — the legacy shape), kept through
 *   DELETED and DRAFT, and otherwise untouched.
 */
export function deriveActionPatch(
  current: ActionPatchCurrent,
  patch: ActionPatchInput,
): DerivedActionPatch {
  const kanbanChanged =
    patch.kanbanStatus != null && patch.kanbanStatus !== current.kanbanStatus;

  let nextStatus: string = current.status;
  if (patch.status !== undefined) {
    nextStatus = patch.status;
  } else if (patch.kanbanStatus && SYNCABLE_STATUSES.has(current.status)) {
    const synced = statusForKanban(patch.kanbanStatus);
    if (synced !== "ACTIVE" || kanbanChanged) nextStatus = synced;
  }

  const statusChanged = nextStatus !== current.status;
  const completing = nextStatus === "COMPLETED" && current.status !== "COMPLETED";
  const uncompleting = current.status === "COMPLETED" && nextStatus !== "COMPLETED";

  const data: DerivedActionPatch["data"] = {};
  if (statusChanged || patch.status !== undefined) {
    data.status = nextStatus as ActionCoarseStatus;
  }

  // The stamp is cleared when the Action stops being completed as a live
  // thing — back to ACTIVE or on to CANCELLED — and also when a card leaves
  // DONE on a real move while its status never followed (the legacy shape),
  // or the row keeps showing in "completed today". DELETED and DRAFT are
  // archival: a soft-deleted completed Action keeps its timestamp.
  const leavingDoneColumn =
    kanbanChanged && patch.kanbanStatus !== "DONE" && SYNCABLE_STATUSES.has(current.status);
  const clearsStamp =
    nextStatus !== "COMPLETED" &&
    ((uncompleting && (nextStatus === "ACTIVE" || nextStatus === "CANCELLED")) ||
      (patch.status === undefined && leavingDoneColumn));

  if (nextStatus === "COMPLETED" && !current.completedAt) {
    data.completedAt = new Date();
  } else if (clearsStamp && current.completedAt) {
    data.completedAt = null;
  }

  return {
    data,
    transitions: { kanbanChanged, nextStatus, statusChanged, completing, uncompleting },
  };
}
