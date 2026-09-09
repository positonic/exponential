import type { PrismaClient } from "@prisma/client";
import { toZonedTime } from "date-fns-tz";
import { partitionActions } from "~/lib/actions/partition";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import type { DailySummaryActionItem, DailySummaryDigest } from "./types";

/**
 * Same base-URL resolution as the email and Matrix channels, so every link in
 * the digest points at the same origin as the deep links those channels
 * append. Resolved per build (not at module load) so cron and tests both see
 * the live environment.
 */
export function summaryBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();
}

/** First whitespace-separated token of the user's name, else "there". */
export function firstNameOf(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "there";
}

/**
 * Today's actions for the digest: exactly the `todays` bucket of the shared
 * `partitionActions` (ADR-0034) over the same ownership set as
 * `action.getTodaysActions` — created-by-me-with-no-assignees OR assigned-to-me,
 * `ACTIVE`, across every workspace — plus the overdue count.
 *
 * `partitionActions` buckets by server-local calendar day. Shifting every
 * instant into the user's timezone frame first (`toZonedTime`, the same shift
 * `summaries.ts` applies to decide the fire window) makes "today" the user's
 * local day without re-implementing the buckets here.
 */
async function loadTodaysActions(
  db: PrismaClient,
  userId: string,
  localNow: Date,
  tz: string,
): Promise<{ todaysActions: DailySummaryActionItem[]; overdueCount: number }> {
  const actions = await db.action.findMany({
    where: {
      OR: [
        { createdById: userId, assignees: { none: {} } },
        { assignees: { some: { userId } } },
      ],
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      scheduledStart: true,
      dueDate: true,
      projectId: true,
      completedAt: true,
    },
  });

  const shift = (d: Date | null) => (d ? toZonedTime(d, tz) : null);
  const partition = partitionActions(
    actions.map((a) => ({
      ...a,
      scheduledStart: shift(a.scheduledStart),
      dueDate: shift(a.dueDate),
      completedAt: shift(a.completedAt),
    })),
    { today: localNow },
  );

  return {
    todaysActions: partition.todays.map((a) => ({ name: a.name })),
    overdueCount: partition.overdue.length,
  };
}

/**
 * Build a user's Daily summary digest for the local day containing `now` in
 * `tz` (the notification-preference timezone that also decides when the
 * summary fires). Returns null when the user is gone.
 */
export async function buildDailySummary(
  db: PrismaClient,
  userId: string,
  now: Date,
  tz: string,
): Promise<DailySummaryDigest | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, defaultWorkspaceId: true },
  });
  if (!user) return null;

  const baseUrl = summaryBaseUrl();
  const localNow = toZonedTime(now, tz);

  const { todaysActions, overdueCount } = await loadTodaysActions(
    db,
    userId,
    localNow,
    tz,
  );

  return {
    firstName: firstNameOf(user.name),
    yesterday: [],
    todayMeetings: [],
    todaysActions,
    overdueCount,
    todayUrl: `${baseUrl}/today`,
    cycles: [],
  };
}
