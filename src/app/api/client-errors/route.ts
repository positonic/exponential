import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  buildClientErrorBody,
  buildClientErrorBug,
  shouldFileClientError,
  type ClientErrorReport,
} from "~/server/services/clientErrors/clientErrorBug";

/**
 * Files a failure the browser handled gracefully as a Bug Ticket.
 *
 * The counterpart to `/api/webhooks/sentry`: that route covers errors Sentry
 * saw, and Sentry sees only what nobody caught. Everything the app handles well
 * — a chat turn that renders "try again", a bridge call that logs and carries
 * on — produced no issue and therefore no ticket. The catch stays; this is how
 * it gets reported.
 *
 * Authenticated by the user's own session rather than an HMAC, which is the
 * reason this is a separate route and not the webhook: the webhook's signing
 * secret cannot be shipped to a browser.
 *
 * Off unless `CLIENT_ERROR_BUGS` is set. Filing tickets from client reports is
 * a per-environment decision — the destination product is shared, and a
 * misbehaving build could otherwise fill someone's tracker.
 */

const ReportSchema = z.object({
  area: z.string().min(1).max(64),
  kind: z.string().max(32).optional(),
  message: z.string().min(1).max(2000),
  context: z.record(z.string().max(64), z.string().max(500)).optional(),
});

/**
 * Per-user ceiling on tickets *created* per window.
 *
 * Repeats of one fault already collapse — the ingest service dedups on the
 * fingerprint — so this only bites when a single user produces many *distinct*
 * errors, which is the runaway case worth stopping.
 *
 * In-memory, so it is per server instance and resets on deploy. That is weaker
 * than it looks on serverless, and deliberately not a database round-trip on a
 * path whose whole job is to be cheap and best-effort. Dedup is the real
 * defence; this is the backstop.
 */
const MAX_REPORTS_PER_WINDOW = 20;
const WINDOW_MS = 60 * 60 * 1000;
const recentByUser = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(userId: string, now: number): boolean {
  const entry = recentByUser.get(userId);
  if (!entry || now >= entry.resetAt) {
    recentByUser.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REPORTS_PER_WINDOW;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CLIENT_ERROR_BUGS) {
    // Not an error: the reporter is fire-and-forget and must not care.
    return NextResponse.json({ filed: false, reason: "disabled" });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let report: ClientErrorReport;
  try {
    report = ReportSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  if (!shouldFileClientError(report.kind)) {
    return NextResponse.json({ filed: false, reason: "not-reportable" });
  }

  if (overRateLimit(session.user.id, Date.now())) {
    console.warn(`[client-errors] rate limit hit for user ${session.user.id}`);
    return NextResponse.json({ filed: false, reason: "rate-limited" });
  }

  try {
    const result = await ingestSentryBug(db, buildClientErrorBug(report), {
      body: buildClientErrorBody(report),
      labels: CLIENT_ERROR_LABELS,
    });
    return NextResponse.json({ filed: result.created, ticketId: result.ticketId });
  } catch (error) {
    // Reporting a failure must never become a second failure the user sees.
    console.error("[client-errors] could not file a bug:", error);
    return NextResponse.json({ filed: false, reason: "ingest-failed" });
  }
}

/**
 * "bug" so it sits with the Sentry-filed ones; "client-error" instead of
 * "Sentry" so the Sentry label keeps meaning the thing it says.
 */
const CLIENT_ERROR_LABELS = [
  { name: "client-error", slug: "client-error", color: "avatar-orange" },
  { name: "bug", slug: "bug", color: "avatar-red" },
] as const;
