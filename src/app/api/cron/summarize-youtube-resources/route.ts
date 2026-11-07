import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { runYouTubeSummarySweep } from "~/server/services/youtubeSummary/youtubeSummarySweep";

/**
 * Cron endpoint: retries the article for YouTube links saved to the Reading
 * list whose first attempt didn't land. Bounded and idempotent —
 * see `services/youtubeSummary/youtubeSummarySweep`.
 *
 * Call via: GET /api/cron/summarize-youtube-resources
 * Vercel cron (see vercel.json) or external scheduler, protected by CRON_SECRET.
 * Fails closed: the sweep spends transcript and model budget, so a missing
 * secret refuses to run rather than opening the route to anyone.
 */

// Only hands each video to its own job, so this stays short.
export const maxDuration = 60;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Cron] summarize-youtube-resources: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runYouTubeSummarySweep(db);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] summarize-youtube-resources failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
