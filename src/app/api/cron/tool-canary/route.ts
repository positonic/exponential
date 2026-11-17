import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { runToolCanaryCheck } from "~/server/services/toolCanary/ToolCanaryService";

/**
 * Cron endpoint: runs the tool canary (ticket 959). The assistant service
 * calls every agent tool that reads from the app against a non-production
 * app; this files the broken ones as `agent-tool` bugs and tells the ops room
 * once when one breaks and once when it works again.
 *
 * Call via: GET /api/cron/tool-canary
 * Vercel cron (daily, see vercel.json), protected by CRON_SECRET. Being in
 * vercel.json is what makes Sentry monitor it (`automaticVercelMonitors`), so
 * a canary that stops running is itself reported.
 *
 * Off until TOOL_CANARY_SECRET is set here and on the assistant service; see
 * dev-docs/OBSERVABILITY.md.
 */
export const maxDuration = 300;

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: a missing CRON_SECRET must not open this route to anyone.
    if (!cronSecret) {
      console.error("[Cron] tool-canary: CRON_SECRET is not configured — refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const provided = Buffer.from(authHeader ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runToolCanaryCheck(db);
    if (result.skipped === "not-configured") {
      console.log("[Cron] tool-canary: not configured (MASTRA_API_URL and TOOL_CANARY_SECRET); skipping");
    }
    // Broken tools are a 200: the canary worked and filed them. A canary that
    // could not run, or that found faults and could not file them, is a
    // failed cron, so its monitor turns red instead of the fault going unseen.
    if (result.fileErrors.length > 0) {
      console.error("[Cron] tool-canary: found faults it could not file:", result.fileErrors);
    }
    const failed = Boolean(result.runnerFailed) || result.fileErrors.length > 0;
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("[Cron] tool-canary failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
