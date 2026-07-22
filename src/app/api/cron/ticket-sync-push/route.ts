import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runOutboundPushSweep } from "~/server/services/ticketSync/pushRunner";

/**
 * Cron endpoint: outbound push-queue drain (ADR-0046). Drains due
 * `TicketSyncPushJob` rows across every push-enabled product sync, writing
 * queued Exponential edits to Notion. Enqueue-on-mutation kicks an immediate
 * best-effort drain; this cron is the durability + retry safety net.
 *
 * Only authenticates (CRON_SECRET) and reports the sweep summary; claim,
 * retry/backoff, and stale-run recovery live in the sweep.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this to the world.
    if (!cronSecret) {
      console.error(
        "[Cron] ticket-sync-push: CRON_SECRET is not configured — refusing to run",
      );
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runOutboundPushSweep(db, new Date(), { trigger: "cron" });
    if (result.failed > 0) {
      console.error("[Cron] ticket-sync-push failures:", result.failed);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] ticket-sync-push sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
