import type { PrismaClient } from "@prisma/client";
import { startOfDay, setHours, setMinutes, addDays, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { NotificationTemplates } from "~/server/services/notifications/NotificationTemplates";
import { emitNotification } from "./emitNotification";
import { NOTIFICATION_CATEGORIES } from "./constants";

const DEFAULT_TIME = "09:00";
/**
 * A summary fires at the first cron tick at/after its configured local time,
 * within this window. Dedup (per user + period) makes it exactly-once; the
 * window just bounds how late a missed tick may fire it.
 */
const FIRE_WINDOW_MS = 60 * 60 * 1000;

const TERMINAL_STATUSES = ["COMPLETED", "DONE", "CANCELLED"];
const DONE_STATUSES = ["COMPLETED", "DONE"];

/** True when `now` is within the fire window after today's local `timeStr` in `tz`. */
function isWithinFireWindow(now: Date, tz: string, timeStr: string): boolean {
  const parts = timeStr.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return false;

  const userNow = toZonedTime(now, tz);
  const targetLocal = setMinutes(setHours(startOfDay(userNow), hours), minutes);
  const targetUtc = fromZonedTime(targetLocal, tz);

  const diff = now.getTime() - targetUtc.getTime();
  return diff >= 0 && diff < FIRE_WINDOW_MS;
}

/** Build the rendered daily digest for a user, or null if the user is gone. */
async function buildDailyDigest(
  db: PrismaClient,
  userId: string,
  now: Date,
  tz: string,
): Promise<{ title: string; message: string } | null> {
  const dayStartLocal = startOfDay(toZonedTime(now, tz));
  const todayStartUtc = fromZonedTime(dayStartLocal, tz);
  const tomorrowStartUtc = fromZonedTime(addDays(dayStartLocal, 1), tz);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return null;

  const tasks = await db.action.findMany({
    where: {
      createdById: userId,
      dueDate: { gte: todayStartUtc, lt: tomorrowStartUtc },
    },
    select: {
      id: true,
      name: true,
      description: true,
      priority: true,
      status: true,
      dueDate: true,
    },
    orderBy: { priority: "desc" },
  });

  const completedTasks = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const pendingTasks = tasks.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;
  const overdueCount = await db.action.count({
    where: {
      createdById: userId,
      status: { notIn: TERMINAL_STATUSES },
      dueDate: { lt: todayStartUtc },
    },
  });

  return NotificationTemplates.dailySummary({
    user,
    tasks,
    stats: {
      todayCount: tasks.length,
      pendingTasks,
      completedTasks,
      overdueCount,
    },
  });
}

/**
 * Cron scheduled-generation (ADR-0045, V4): emit each user's daily digest at
 * their configured local time, through the pipeline so it honours the Summary
 * row of the matrix. Replaces the dead scheduler's `scheduleRecurringNotifications`.
 * Weekly digests are added in action 2.
 */
export async function generateScheduledSummaries(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ emitted: number }> {
  const prefs = await db.notificationPreference.findMany({
    where: { enabled: true, dailySummary: true },
    select: { userId: true, timezone: true, dailySummaryTime: true },
  });

  let emitted = 0;

  for (const pref of prefs) {
    const tz = pref.timezone ?? "UTC";

    if (isWithinFireWindow(now, tz, pref.dailySummaryTime ?? DEFAULT_TIME)) {
      const periodKey = format(toZonedTime(now, tz), "yyyy-MM-dd");
      const digest = await buildDailyDigest(db, pref.userId, now, tz);
      if (!digest) continue;

      await emitNotification({
        category: NOTIFICATION_CATEGORIES.SUMMARY,
        actorUserId: null,
        subject: {
          userId: pref.userId,
          kind: "daily",
          title: digest.title,
          message: digest.message,
          periodKey,
        },
        db,
      });
      emitted++;
    }
  }

  return { emitted };
}
