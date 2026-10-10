import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { runMeetingEmbeddingSweep } from "~/server/services/meetings/meetingEmbeddingSweep";

/**
 * Cron endpoint: indexes Meetings into the Knowledge Base. Re-stamps the
 * scope of chunks whose Meeting moved, then embeds a bounded batch of Meetings
 * that were never embedded or whose transcript changed — all work inside the
 * request, never post-response. Idempotent. See
 * `services/meetings/meetingEmbeddingSweep`.
 *
 * Call via: GET /api/cron/embed-meetings
 * Vercel cron (see vercel.json) or external scheduler, protected by CRON_SECRET.
 * Fails closed: the sweep spends embedding budget, so a missing secret refuses
 * to run rather than opening the route to anyone.
 */

// A batch of long transcripts is several embedding round-trips each.
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Cron] embed-meetings: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runMeetingEmbeddingSweep(db);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] embed-meetings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
