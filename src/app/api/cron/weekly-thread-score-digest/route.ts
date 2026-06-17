import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { threadScoreDigestService } from "~/server/services/notifications/ThreadScoreDigestService";

/**
 * Cron endpoint: sends the weekly Thread-score digest (top Failure lanes
 * with example Threads, ADR-0012 Phase 2) to all admins via Slack.
 *
 * Call via: GET /api/cron/weekly-thread-score-digest
 * Vercel cron (Mondays, see vercel.json) or external scheduler, protected
 * by CRON_SECRET. Manual trigger: admin.sendThreadScoreDigest.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await threadScoreDigestService.sendDigestToAdmins();
    if (!result.success) {
      console.error("[Cron] Thread-score digest errors:", result.errors);
    }

    return NextResponse.json({
      success: result.success,
      sentTo: result.sentTo,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[Cron] Thread-score digest failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
