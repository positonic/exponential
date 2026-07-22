import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { retryPendingDeliveries } from "~/server/services/notifications/emit/processNotifications";
import { generateDueDateReminders } from "~/server/services/notifications/emit/dueDateReminders";

/**
 * Cron endpoint (ADR-0045) for the unified notification pipeline. Generates
 * scheduled notifications as they come due (V3: due-date reminders; summaries in
 * V4) and retries any NotificationDelivery that hasn't succeeded (failed, or
 * orphaned-pending) under the attempt cap.
 *
 * Call via: GET /api/cron/process-notifications — Vercel cron, CRON_SECRET-protected.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Scheduled generation: emit due-date reminders as their offsets are crossed.
    const dueDate = await generateDueDateReminders(db);
    // Retry backstop: re-attempt any delivery that hasn't succeeded.
    const retry = await retryPendingDeliveries(db);

    return NextResponse.json({ ok: true, dueDate, retry });
  } catch (error) {
    console.error("[cron/process-notifications] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
