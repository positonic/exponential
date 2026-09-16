import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { db } from "~/server/db";
import { sweepDueAgendas } from "~/server/services/ceremonies/agenda/circulateAgenda";

/**
 * Cron endpoint (hourly, see vercel.json): generate and circulate agendas for
 * every occurrence inside its ceremony's lead time (ADR-0059). Generation runs
 * inside this request, never fire-and-forget (Vercel freezes detached work).
 * Same fail-closed CRON_SECRET guard as adr-sync.
 */
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[Cron] ceremony-agendas: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sweepDueAgendas(db, new Date());
    if (result.errors.length > 0) {
      console.error("[Cron] ceremony-agendas sweep errors:", result.errors);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] ceremony-agendas sweep failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
