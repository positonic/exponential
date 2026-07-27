import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { runPendingEnrichments } from "~/server/services/crm/enrichment/runPendingEnrichments";

/**
 * Cron endpoint: drains PENDING CRM contact enrichment jobs (created when a
 * contact is added in a workspace with `enableAutoEnrichContacts` on) and hands
 * each contact to Mastra's `enrichmentAgent` for web-search + write-back.
 *
 * A durable queue drained by cron — rather than a fire-and-forget fetch from the
 * create mutation — is deliberate: Vercel serverless can freeze a function after
 * it returns, orphaning un-awaited async work. Registered in vercel.json.
 *
 * Auth is the shared CRON_SECRET. Because this endpoint has real external side
 * effects (it triggers Mastra agent runs and paid web searches), it fails
 * closed: a missing CRON_SECRET denies every request rather than leaving the
 * sweep open to anonymous callers.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runPendingEnrichments(db, new Date());
    if (result.failed.length > 0) {
      console.error("[Cron] contact enrichments failed:", result.failed);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] enrich-pending-contacts failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
