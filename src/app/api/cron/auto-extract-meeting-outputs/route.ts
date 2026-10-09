import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { runAutoExtractOutputsSweep } from "~/server/services/meetings/autoExtractOutputs";

/**
 * Cron endpoint: runs "Extract outputs" for recordings of ceremonies that
 * opted in (`Ceremony.autoExtractOutputs`), a bounded batch per request —
 * all work inside the request, never post-response. Idempotent: only rows
 * without `outputsExtractedAt` are picked up. See
 * `services/meetings/autoExtractOutputs`.
 *
 * Call via: GET /api/cron/auto-extract-meeting-outputs
 * Vercel cron (see vercel.json) or external scheduler, protected by CRON_SECRET.
 */

// Each extraction is a chunked model reading; three of them need headroom.
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runAutoExtractOutputsSweep(db);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] auto-extract-meeting-outputs failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
