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

/** A user's configured reminder offsets, cached within a cron run. */
async function getUserOffsets(
  db: PrismaClient,
  userId: string,
  cache: Map<string, number[]>,
): Promise<number[]> {
  const cached = cache.get(userId);
  if (cached) return cached;

  const pref = await db.notificationPreference.findUnique({
    where: { userId },
    select: { reminderMinutesBefore: true },
  });
  // A row with an explicit (even empty) list wins; no row → defaults.
  const offsets = pref?.reminderMinutesBefore ?? DEFAULT_OFFSETS;
  cache.set(userId, offsets);
  return offsets;
}

/**
 * Cron scheduled-generation (ADR-0045, V3): scan upcoming owned actions and emit
 * a Due-date reminder to the owner as each reminder offset is crossed. Dedup
 * (per action, offset, owner) makes it safe to run every tick.
 */
export async function generateDueDateReminders(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ emitted: number }> {
  const horizon = new Date(now.getTime() + SCAN_HORIZON_MS);

  const actions = await db.action.findMany({
    where: {
      dueDate: { gt: now, lte: horizon },
      status: { notIn: TERMINAL_STATUSES },
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
  const offsetCache = new Map<string, number[]>();

  for (const action of actions) {
    if (!action.dueDate) continue;
    const ws = action.workspace ?? action.project?.workspace;
    if (!ws) continue;

    const ownerIds = resolveOwnerIds(action);

    for (const ownerId of ownerIds) {
      const offsets = await getUserOffsets(db, ownerId, offsetCache);
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
