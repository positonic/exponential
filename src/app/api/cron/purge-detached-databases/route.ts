import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { purgeDetachedDatabases } from "~/server/services/databases/lifecycle";

/**
 * Cron endpoint (daily, see vercel.json): delete databases whose block has
 * been out of its page for longer than the retention window (ADR-0078).
 * Removing the block only detaches; this sweep is where the rows finally go.
 * Authenticates with CRON_SECRET like every cron route, so the self-host
 * scheduler (ADR-0077) drives it unchanged.
 */
export const maxDuration = 120;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open the sweep to anyone.
    if (!cronSecret) {
      console.error("[Cron] purge-detached-databases: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await purgeDetachedDatabases(db, new Date());
    if (result.errors.length > 0) {
      console.error("[Cron] purge-detached-databases errors:", result.errors);
    }
    return NextResponse.json({
      success: true,
      cutoff: result.cutoff.toISOString(),
      purged: result.purged,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[Cron] purge-detached-databases failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
