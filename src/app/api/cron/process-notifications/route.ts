import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { retryPendingDeliveries } from "~/server/services/notifications/emit/processNotifications";
import { generateDueDateReminders } from "~/server/services/notifications/emit/dueDateReminders";
import { generateScheduledSummaries } from "~/server/services/notifications/emit/summaries";
import { deliverPendingOutboundPosts } from "~/server/services/outboundPosts/deliver";

/**
 * Cron endpoint (ADR-0045) for the unified notification pipeline. Generates
 * scheduled notifications as they come due (due-date reminders, daily/weekly
 * summaries), retries any NotificationDelivery that hasn't succeeded (failed,
 * or orphaned-pending) under the attempt cap, and sweeps outbound room posts
 * (ADR-0075) the same way.
 *
 * Call via: GET /api/cron/process-notifications — Vercel cron, CRON_SECRET-protected.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this route to anyone.
    if (!cronSecret) {
      console.error("[Cron] process-notifications: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Scheduled generation: due-date reminders as offsets cross, and daily/weekly
    // summaries at their configured local times.
    const dueDate = await generateDueDateReminders(db);
    const summaries = await generateScheduledSummaries(db);
    // Retry backstop: re-attempt any delivery that hasn't succeeded.
    const retry = await retryPendingDeliveries(db);
    // Outbound posts (ADR-0075) ride the same cron: rows left pending by a crashed
    // `after()` or failed under the attempt cap. Isolated so a bad post can never
    // take the person-keyed retries down with it.
    let outbound: Awaited<ReturnType<typeof deliverPendingOutboundPosts>> | { error: string };
    try {
      outbound = await deliverPendingOutboundPosts(db);
    } catch (error) {
      console.error("[cron/process-notifications] outbound post sweep failed:", error);
      outbound = { error: error instanceof Error ? error.message : "unknown error" };
    }

    return NextResponse.json({ ok: true, dueDate, summaries, retry, outbound });
  } catch (error) {
    console.error("[cron/process-notifications] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
