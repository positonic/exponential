import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runDueChangelogDrafts } from "~/plugins/product/server/cycleChangelogDraftRunner";

export const maxDuration = 300;

/**
 * Cron endpoint: writes the change-log draft for every cycle that ended in the
 * last two weeks and has none yet (see vercel.json — hourly). Each draft is
 * one model call (up to a couple of minutes); the runner caps a sweep at two. This route only
 * authenticates (CRON_SECRET) and reports the sweep.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: every draft is a paid model call.
    if (!cronSecret) {
      console.error(
        "[Cron] cycle-changelog-drafts: CRON_SECRET is not configured — refusing to run",
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

    const results = await runDueChangelogDrafts(db, new Date());
    const errors = results.filter((r) => r.outcome === "error");
    if (errors.length > 0) {
      console.error("[Cron] cycle-changelog-drafts errors:", errors);
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("[Cron] cycle-changelog-drafts sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
