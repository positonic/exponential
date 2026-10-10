import { type NextRequest, NextResponse } from "next/server";

import { db } from "~/server/db";
import { dispatchQueuedRuns } from "~/server/services/agentRuns/dispatch";

/**
 * Hosted Agent-run dispatcher (ADR-0067, Agent PRD D4).
 *
 * Kicked by `after()` from the assign mutation (POST, optionally `?runId=`)
 * and swept by the minute cron. Auth is the shared CRON_SECRET, fail-closed:
 * a missing secret denies every request rather than leaving the endpoint
 * open, because a call here spends LLM budget as someone's Assistant.
 *
 * `maxDuration` is the ceiling for one invocation; `maxSteps: 12` on the run
 * agent keeps a single run well inside it.
 */
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const onlyRunId = request.nextUrl.searchParams.get("runId") ?? undefined;
    const result = await dispatchQueuedRuns(db, new Date(), { onlyRunId });
    if (result.failed.length > 0) {
      console.error("[agentRuns] runs failed:", result.failed);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[agentRuns] dispatch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
