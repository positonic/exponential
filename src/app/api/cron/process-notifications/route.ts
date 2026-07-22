import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { retryPendingDeliveries } from "~/server/services/notifications/emit/processNotifications";

/**
 * Cron endpoint (ADR-0045): the retry backstop for the unified notification
 * pipeline. Re-attempts any NotificationDelivery that hasn't succeeded (failed,
 * or orphaned-pending) under the attempt cap. Scheduled-notification generation
 * (summaries, due-date reminders) is added in later scopes; V1 is retry-only.
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

    const result = await retryPendingDeliveries(db);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/process-notifications] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
