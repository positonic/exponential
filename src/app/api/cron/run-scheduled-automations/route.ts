import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runDueScheduledAutomations } from "~/server/services/workflows/scheduling/scheduledRunner";

/**
 * Cron endpoint: runs every `scheduled` Automation that is due this period —
 * the platform mechanism behind Broadcasts like "What Shipped Today"
 * ([ADR-0029](../../../../../docs/adr/0029-automation-platform-primitive.md)).
 *
 * Swept hourly (see vercel.json) so any cadence hour fires within the hour.
 * Due-evaluation + per-period idempotency live in the scheduled runner; this
 * route only authenticates (CRON_SECRET) and reports the summary.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runDueScheduledAutomations(db, new Date());
    if (result.failed.length > 0) {
      console.error("[Cron] scheduled automations failed:", result.failed);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] run-scheduled-automations failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
