import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { runMeetingSummarySweep } from "~/server/services/meetings/meetingSummarySweep";

/**
 * Cron endpoint: auto-summarizes meetings (ADR-0018, royal.raven).
 *
 * Selects meetings with a transcript but no summary, summarizes a bounded batch
 * inline (all work within the request — NO post-response fire-and-forget, which
 * a serverless function can't run reliably), persists each summary, and emits a
 * `meeting`/`summarized` activity event when one lands. Idempotent: only
 * summary-null rows are picked up, so it heals the corpus forward and is safe to
 * re-run.
 *
 * Call via: GET /api/cron/auto-summarize-meetings
 * Vercel cron (see vercel.json) or external scheduler, protected by CRON_SECRET.
 */

// Allow the inline LLM summarization batch headroom beyond the default budget.
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runMeetingSummarySweep(db);

    if (result.notConfigured) {
      console.warn(
        "[Cron] auto-summarize-meetings: summarization not configured (missing OPENAI_API_KEY)",
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] auto-summarize-meetings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
