import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { aiConfiguredOrSkip } from "~/server/services/ai/requireAi";
import { db } from "~/server/db";
import { attachUnlinkedMeetings } from "~/server/services/ceremonies/autoAttach";
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

    // Fail closed: a missing CRON_SECRET must not open this route to anyone.
    if (!cronSecret) {
      console.error("[Cron] auto-summarize-meetings: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!aiConfiguredOrSkip("summaries", "cron auto-summarize-meetings")) {
      // The ceremony catch-up at the start of the sweep needs no model and has
      // no other scheduled caller, so keyless installs still get it.
      const ceremonyCatchUp = await attachUnlinkedMeetings(db);
      return NextResponse.json({ success: true, skipped: "ai-not-configured", ceremonyCatchUp });
    }

    const result = await runMeetingSummarySweep(db);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] auto-summarize-meetings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
