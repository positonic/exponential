import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runCalendarSync } from "~/server/services/calendar/CalendarSyncService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

export const maxDuration = 300;

/**
 * Cron endpoint: re-syncs ICS calendar feeds into the CalendarEvent table
 * (see ADR-0057). Bounded per invocation — a capped, oldest-first batch —
 * because Vercel serverless can freeze a function after it returns, so all
 * work must complete before the response. Registered in vercel.json.
 *
 * Auth is the shared CRON_SECRET. Fetching user-supplied feed URLs is a real
 * external side effect, so this fails closed: a missing CRON_SECRET denies
 * every request rather than leaving the sweep open to anonymous callers.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runCalendarSync(db);
    if (result.failed.length > 0) {
      // Per-feed error *transitions* are reported to Sentry inside syncFeed;
      // this log keeps the batch summary greppable in function logs.
      console.error("[Cron] calendar feed syncs failed:", result.failed);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    reportHandledErrorServer(error, { area: "cron.sync-calendars" });
    console.error("[Cron] sync-calendars failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
