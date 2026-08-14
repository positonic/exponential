import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runDueAdrSyncs } from "~/server/services/adrSync/scheduler";

/**
 * Cron endpoint: hourly ADR projection sweep for every enabled Decision Log
 * sync config (see vercel.json). The rate-limit budget lives in the engine —
 * an unchanged repo costs ~1 API call via the tree-SHA short-circuit.
 * Overlap and stale-run guarding live in the scheduler; this route only
 * authenticates (CRON_SECRET) and reports the sweep summary.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: this endpoint sweeps every workspace's enrolled repos. A
    // missing CRON_SECRET must not silently open it to unauthenticated callers.
    if (!cronSecret) {
      console.error("[Cron] adr-sync: CRON_SECRET is not configured — refusing to run");
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

    const result = await runDueAdrSyncs(db, new Date());
    const errors = result.items.filter((i) => i.outcome === "error");
    if (errors.length > 0) {
      console.error("[Cron] adr-sync sweep errors:", errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] adr-sync sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
