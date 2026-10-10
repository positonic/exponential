import type { PrismaClient } from "@prisma/client";
import { emitNotification } from "./emitNotification";
import { NOTIFICATION_CATEGORIES } from "./constants";
import type { DueDateSubject } from "./types";

/** How far ahead to scan for upcoming due dates (covers the largest offset). */
const SCAN_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;
/**
 * A reminder fires only as its offset boundary is crossed — within this window
 * of "now". Larger than the cron cadence so a missed tick still catches the
 * crossing, but small enough that offsets which elapsed before we noticed the
 * action are never back-filled. Dedup makes re-fires within the window harmless.
 */
const LOOKBACK_MS = 15 * 60 * 1000;

const TERMINAL_STATUSES = ["COMPLETED", "DONE", "CANCELLED"];

/** Fallback reminder offsets (minutes) when a user has no NotificationPreference. */
const DEFAULT_OFFSETS = [15, 60, 1440];

/**
 * The Owner of an action — its assignees if any, else its creator (CONTEXT:
 * Owner). The reusable recipient rule for owner-scoped notifications.
 */
export function resolveOwnerIds(action: {
  createdById: string;
  assignees: { userId: string }[];
}): string[] {
  return action.assignees.length > 0
    ? [...new Set(action.assignees.map((a) => a.userId))]
    : [action.createdById];
}

/**
 * Every user's configured reminder offsets, in one query. A row with an
 * explicit (even empty) list wins; users with no row get the defaults.
 */
async function loadUserOffsets(db: PrismaClient): Promise<Map<string, number[]>> {
  const prefs = await db.notificationPreference.findMany({
    select: { userId: true, reminderMinutesBefore: true },
  });
  return new Map(prefs.map((p) => [p.userId, p.reminderMinutesBefore]));
}

/**
 * Cron scheduled-generation (ADR-0045, V3): scan upcoming owned actions and emit
 * a Due-date reminder to the owner as each reminder offset is crossed. Dedup
 * (per action, offset, owner) makes it safe to run every tick.
 *
 * Runs every 2 minutes, so the scan is narrowed to the actions that can fire
 * now: those due within one lookback window of some offset in use, not every
 * open action due in the next 8 days.
 */
export async function generateDueDateReminders(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ emitted: number }> {
  const horizon = new Date(now.getTime() + SCAN_HORIZON_MS);
  const userOffsets = await loadUserOffsets(db);
  const offsetsInUse = new Set([...DEFAULT_OFFSETS, ...[...userOffsets.values()].flat()]);

  const actions = await db.action.findMany({
    where: {
      dueDate: { gt: now, lte: horizon },
      status: { notIn: TERMINAL_STATUSES },
      // A reminder fires when dueDate - offset is in (now - LOOKBACK, now].
      OR: [...offsetsInUse].map((offset) => ({
        dueDate: {
          gt: new Date(now.getTime() - LOOKBACK_MS + offset * 60_000),
          lte: new Date(now.getTime() + offset * 60_000),
        },
      })),
    },
    select: {
      id: true,
      name: true,
      dueDate: true,
      createdById: true,
      workspace: { select: { id: true, slug: true } },
      project: { select: { workspace: { select: { id: true, slug: true } } } },
      assignees: { select: { userId: true } },
    },
  });

  let emitted = 0;

  for (const action of actions) {
    if (!action.dueDate) continue;
    const ws = action.workspace ?? action.project?.workspace;
    if (!ws) continue;

    const ownerIds = resolveOwnerIds(action);

    for (const ownerId of ownerIds) {
      const offsets = userOffsets.get(ownerId) ?? DEFAULT_OFFSETS;
      for (const offset of offsets) {
        const reminderMs = action.dueDate.getTime() - offset * 60_000;
        // Fire only as the boundary is crossed (within the last window).
        if (reminderMs > now.getTime()) continue;
        if (reminderMs <= now.getTime() - LOOKBACK_MS) continue;

        const subject: DueDateSubject = {
          actionId: action.id,
          actionName: action.name,
          ownerUserId: ownerId,
          offsetMinutes: offset,
          dueDate: action.dueDate,
          workspaceId: ws.id,
          workspaceSlug: ws.slug,
        };

        await emitNotification({
          category: NOTIFICATION_CATEGORIES.DUE_DATE,
          actorUserId: null,
          subject,
          db,
        });
        emitted++;
      }
    }
  }

  return { emitted };
}
