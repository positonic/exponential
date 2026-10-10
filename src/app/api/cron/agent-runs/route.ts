import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { sweepAgentRuns } from "~/server/services/agentRuns/sweep";

/**
 * Minute cron for Agent runs (ADR-0067, Agent PRD D4): times out RUNNING rows
 * with no heartbeat for five minutes and dispatches QUEUED rows older than a
 * minute that the assign-time kick missed.
 *
 * Auth is the shared CRON_SECRET, fail-closed like the dispatch route: this
 * endpoint spends LLM budget as someone's Assistant, so a missing secret
 * denies every request.
 */
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sweepAgentRuns(db, new Date());
    if (result.dispatch.failed.length > 0) {
      console.error("[Cron] agent runs failed:", result.dispatch.failed);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] agent-runs failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
