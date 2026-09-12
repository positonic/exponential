import type { PrismaClient } from "@prisma/client";
import { startOfDay, setHours, setMinutes, format, getDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { NotificationTemplates } from "~/server/services/notifications/NotificationTemplates";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { emitNotification } from "./emitNotification";
import { NOTIFICATION_CATEGORIES } from "./constants";
import {
  DAILY_SUMMARY_TITLE,
  type BuildDailySummaryOptions,
  buildDailySummary,
  renderDailySummaryMarkdown,
  renderDailySummaryPlainText,
} from "./dailySummary";
import { DEFAULT_SUMMARY_TIME, resolveSummaryTimezone } from "./summarySchedule";

/**
 * A summary fires at the first cron tick at/after its configured local time,
 * within this window. Dedup (per user + period) makes it exactly-once; the
 * window just bounds how late a missed tick may fire it.
 */
const FIRE_WINDOW_MS = 60 * 60 * 1000;

const DONE_STATUSES = ["COMPLETED", "DONE"];

/** A rendered digest ready to emit: plain text in `message`, optional rich variant. */
interface RenderedDigest {
  title: string;
  message: string;
  /** Markdown rendering for channels that render it (Matrix) — see ADR-0059. */
  markdown?: string;
}

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

/**
 * Build and render the Daily summary for a user (ADR-0059): one structured
 * digest, rendered as plain text for `message` and as markdown for the Matrix
 * channel. Null if the user is gone.
 */
async function buildDailyDigest(
  db: PrismaClient,
  userId: string,
  now: Date,
  tz: string,
  options: BuildDailySummaryOptions,
): Promise<RenderedDigest | null> {
  const digest = await buildDailySummary(db, userId, now, tz, options);
  if (!digest) return null;
  return {
    title: DAILY_SUMMARY_TITLE,
    message: renderDailySummaryPlainText(digest),
    markdown: renderDailySummaryMarkdown(digest),
  };
}

/** True when today (local) is the user's weekly day and we're in the fire window. */
function isWeeklyDue(
  now: Date,
  tz: string,
  weeklyDayOfWeek: number,
  timeStr: string,
): boolean {
  // weeklyDayOfWeek is 1=Mon…7=Sun; getDay is 0=Sun…6=Sat → map Sunday to 7.
  const localDay = getDay(toZonedTime(now, tz)) || 7;
  if (localDay !== weeklyDayOfWeek) return false;
  return isWithinFireWindow(now, tz, timeStr);
}

/** Build the rendered weekly digest for a user, or null if the user is gone. */
async function buildWeeklyDigest(
  db: PrismaClient,
  userId: string,
): Promise<RenderedDigest | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return null;

  const tasks = await db.action.findMany({
    where: { createdById: userId },
    select: { status: true },
  });
  const completedTasks = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;

  const projects = await db.project.findMany({
    where: { createdById: userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, status: true, progress: true },
  });

  return NotificationTemplates.weeklySummary({
    user,
    projects,
    stats: { totalTasks: tasks.length, completedTasks },
  });
}

/** Emit one pre-rendered summary through the pipeline. */
async function emitSummary(
  db: PrismaClient,
  userId: string,
  kind: "daily" | "weekly",
  digest: RenderedDigest,
  periodKey: string,
): Promise<void> {
  await emitNotification({
    category: NOTIFICATION_CATEGORIES.SUMMARY,
    actorUserId: null,
    subject: {
      userId,
      kind,
      title: digest.title,
      message: digest.message,
      ...(digest.markdown ? { markdown: digest.markdown } : {}),
      periodKey,
    },
    db,
  });
}

/**
 * Cron scheduled-generation (ADR-0045, V4): emit each user's daily and weekly
 * digests at their configured local time (weekly also on their configured day),
 * through the pipeline so they honour the Summary row of the matrix. Deduped per
 * user+period. Replaces the dead scheduler's `scheduleRecurringNotifications`.
 *
 * `options.readCalendar` is the injectable calendar reader behind the daily
 * digest's Yesterday / Today's meetings sections — tests pass a fixture reader;
 * production defaults to the multi-calendar merge.
 */
export async function generateScheduledSummaries(
  db: PrismaClient,
  now: Date = new Date(),
  options: BuildDailySummaryOptions = {},
): Promise<{ emitted: number }> {
  const prefs = await db.notificationPreference.findMany({
    where: {
      enabled: true,
      OR: [{ dailySummary: true }, { weeklySummary: true }],
    },
    select: {
      userId: true,
      timezone: true,
      dailySummaryTime: true,
      dailySummary: true,
      weeklySummary: true,
      weeklyDayOfWeek: true,
      user: { select: { timezone: true } },
    },
  });

  let emitted = 0;

  for (const pref of prefs) {
    const tz = resolveSummaryTimezone(pref);
    const time = pref.dailySummaryTime ?? DEFAULT_SUMMARY_TIME;

    // One user's failing build must not cost every later user their digest:
    // report it and move on. Dedup means the user simply gets it on the next
    // tick inside the fire window if the cause was transient.
    const attempt = async (kind: "daily" | "weekly", run: () => Promise<void>) => {
      try {
        await run();
      } catch (error) {
        reportHandledErrorServer(error, {
          area: "scheduled-summaries",
          context: { userId: pref.userId, kind, tz },
        });
      }
    };

    if (pref.dailySummary && isWithinFireWindow(now, tz, time)) {
      await attempt("daily", async () => {
        const periodKey = format(toZonedTime(now, tz), "yyyy-MM-dd");
        const digest = await buildDailyDigest(db, pref.userId, now, tz, options);
        if (digest) {
          await emitSummary(db, pref.userId, "daily", digest, periodKey);
          emitted++;
        }
      });
    }

    if (pref.weeklySummary && isWeeklyDue(now, tz, pref.weeklyDayOfWeek ?? 1, time)) {
      await attempt("weekly", async () => {
        const periodKey = format(toZonedTime(now, tz), "RRRR-'W'II");
        const digest = await buildWeeklyDigest(db, pref.userId);
        if (digest) {
          await emitSummary(db, pref.userId, "weekly", digest, periodKey);
          emitted++;
        }
      });
    }
  }

  return { emitted };
}
