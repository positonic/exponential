import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { expandActiveCeremonies } from "~/server/services/ceremonies/occurrences";

/**
 * Cron endpoint (hourly, see vercel.json): expand every active ceremony's
 * cadence rule into `CeremonyOccurrence` rows through the rolling window
 * (ADR-0059). Idempotent — writes go through `createMany({ skipDuplicates })`
 * against the `(ceremonyId, scheduledStart)` unique. Authenticates with
 * CRON_SECRET exactly like adr-sync; the `PMScheduler` node-cron singleton is
 * not used because it never runs on Vercel.
 */
export const maxDuration = 120;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open the sweep to anyone.
    if (!cronSecret) {
      console.error("[Cron] ceremony-occurrences: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await expandActiveCeremonies(db, new Date());
    if (result.errors.length > 0) {
      console.error("[Cron] ceremony-occurrences sweep errors:", result.errors);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] ceremony-occurrences sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
