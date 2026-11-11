import { type NextRequest, NextResponse, after } from "next/server";

import { db } from "~/server/db";
import { enrichYouTubeResource } from "~/server/services/youtubeSummary/enrichYouTubeResource";

/**
 * Writes one saved video's article. Kicked after a save and by the cron sweep.
 * Answers at once and does the work in `after()`, so a caller never holds a
 * connection open for minutes. `maxDuration` is the ceiling for that work.
 *
 * Auth is the shared CRON_SECRET, fail-closed: a call here spends LLM budget.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resourceId = request.nextUrl.searchParams.get("resourceId");
  if (!resourceId) {
    return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
  }

  after(async () => {
    const outcome = await enrichYouTubeResource(db, resourceId);
    console.log(`[youtubeSummary] ${resourceId}:`, outcome);
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
