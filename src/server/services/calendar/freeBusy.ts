/**
 * The free/busy read contract (V2 → consumed by V3 scheduling).
 *
 * PRIVACY INVARIANT (hard, per the feature PRD and ADR-0057): cross-user
 * calendar reads expose ONLY start/end/all-day/source. Never title, location,
 * or attendees. The enforcement is structural — the Prisma `select` below is
 * the whole contract, not a post-filter — so a future procedure can only leak
 * event details by visibly editing this select, which fails review.
 *
 * Any V3 procedure that reads other users' CalendarEvent rows MUST go
 * through this helper rather than querying the table directly.
 */

import type { PrismaClient } from "@prisma/client";

export interface BusyBlock {
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  sourceType: string;
}

/**
 * Busy blocks for each requested user overlapping [from, to), from every
 * synced source: ICS feed rows (enabled feeds only — a disabled feed is the
 * owner saying "this calendar doesn't count") and provider busy-time rows.
 *
 * Returns a map keyed by userId; users with no rows are present with an
 * empty array so callers can tell "free all day" from "not queried".
 */
export async function listBusyBlocksByUser(
  db: PrismaClient,
  userIds: string[],
  range: { from: Date; to: Date },
): Promise<Map<string, BusyBlock[]>> {
  const byUser = new Map<string, BusyBlock[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return byUser;

  const rows = await db.calendarEvent.findMany({
    where: {
      userId: { in: userIds },
      startsAt: { lt: range.to },
      endsAt: { gt: range.from },
      OR: [{ sourceType: { not: "ics" } }, { calendarFeed: { isEnabled: true } }],
    },
    // THE free/busy contract. Do not add fields here — see module doc.
    select: {
      userId: true,
      startsAt: true,
      endsAt: true,
      isAllDay: true,
      sourceType: true,
    },
    orderBy: { startsAt: "asc" },
  });

  for (const row of rows) {
    byUser.get(row.userId)?.push({
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      isAllDay: row.isAllDay,
      sourceType: row.sourceType,
    });
  }

  return byUser;
}
