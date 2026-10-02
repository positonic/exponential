import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { defaultGenerateDeps } from "~/server/services/workspaceUpdates/deps";
import { defaultDistributeChannels } from "~/server/services/workspaceUpdates/channels";
import { runDueWorkspaceUpdates, runPendingDistributions } from "~/server/services/workspaceUpdates/runner";

/**
 * Cron endpoint: drafts each enabled workspace's weekly update once its local
 * trigger (e.g. Friday 09:00 in the workspace's timezone) has passed, then
 * hands it to the reviewers; then retries distribution of approved updates
 * whose channels have not all finished. Nothing is sent until a reviewer
 * approves. Swept hourly (see vercel.json); due-evaluation, per-period
 * idempotency and per-channel idempotency live in the services.
 */
// Each due workspace makes one model call and a few writes; give a busy
// Friday hour room to finish.
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this to anyone.
    if (!cronSecret) {
      console.error("[Cron] workspace-updates: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const result = await runDueWorkspaceUpdates(db, now, (workspaceId) =>
      defaultGenerateDeps(db, { workspaceId }),
    );
    if (result.failed.length > 0) {
      console.error("[Cron] workspace-updates failed:", result.failed);
    }
    // Retry approved updates whose distribution has not finished.
    const distribution = await runPendingDistributions(db, now, defaultDistributeChannels(db));
    if (distribution.stillFailing.length > 0 || distribution.errored.length > 0) {
      console.error("[Cron] workspace-updates distribution incomplete:", distribution);
    }

    return NextResponse.json({ success: true, ...result, distribution });
  } catch (error) {
    console.error("[Cron] workspace-updates failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
