import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runDueTicketSyncs } from "~/server/services/ticketSync/scheduler";

/**
 * Cron endpoint: inbound Notion → ticket sync sweep for every enabled
 * product sync config (see vercel.json — every 10 minutes). Overlap and
 * stale-run guarding live in the scheduler; this route only authenticates
 * (CRON_SECRET) and reports the sweep summary.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: this endpoint sweeps every product's sync. A missing
    // CRON_SECRET must not silently open it to unauthenticated callers.
    if (!cronSecret) {
      console.error("[Cron] ticket-sync: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runDueTicketSyncs(db, new Date());
    const errors = result.items.filter((i) => i.outcome === "error");
    if (errors.length > 0) {
      console.error("[Cron] ticket-sync sweep errors:", errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] ticket-sync sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
