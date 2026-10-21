import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { sendAgentHealthDigest } from "~/server/services/notifications/AgentHealthDigestService";

/**
 * Cron endpoint: posts the daily agent-health digest (failed turns and failing
 * tools over the last 24h) to the Matrix ops room. Silent on a clean day.
 *
 * Call via: GET /api/cron/agent-health-digest
 * Vercel cron (daily, see vercel.json) or external scheduler, protected by
 * CRON_SECRET.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this route to anyone.
    if (!cronSecret) {
      console.error("[Cron] agent-health-digest: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendAgentHealthDigest(db);
    if (result.failedTurns > 0 && !result.posted) {
      console.error("[Cron] agent-health-digest: had findings but could not post to Matrix", result);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Cron] agent-health-digest failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
