import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

// A batch of large pages is several embeddings calls each, run in-request.
export const maxDuration = 300;

/**
 * Cron endpoint: Page search-index backstop (ADR-0033). Each save re-indexes
 * its Page after a settle delay via `after()`; this sweep re-indexes any
 * recently-saved Page whose chunks still predate the save (dropped or failed
 * trigger), and clears chunks left on Pages since opted out or emptied.
 * Bounded per run, oldest first. Registered in vercel.json.
 */
export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this to the world.
    if (!cronSecret) {
      console.error(
        "[Cron] reindex-pages: CRON_SECRET is not configured — refusing to run",
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

    const result = await getEmbeddingTriggerService(db).reindexStalePages();
    if (result.checked > 0) {
      console.log("[Cron] reindex-pages:", result);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    reportHandledErrorServer(error, { area: "cron.reindex-pages" });
    console.error("[Cron] reindex-pages failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
