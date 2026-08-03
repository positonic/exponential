import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "~/server/db";
import {
  extractDatabaseCandidateIds,
  triggerWebhookInboundSync,
} from "~/server/services/ticketSync/webhookTrigger";

/**
 * Webhook receiver: POST /api/webhooks/notion.
 *
 * A doorbell for the inbound Notion → ticket sync. Notion sends a thin event
 * (ids only) when a subscribed database changes; this route verifies it and
 * fires the SAME inbound pull the 10-minute cron runs (trigger `webhook`),
 * turning that sync near-real-time WITHOUT touching the sync engine. It never
 * processes event *content* — only the ids needed to resolve which sync
 * config to pull — and always answers 200 fast (the run is fire-and-forget).
 *
 * Auth model (developers.notion.com/reference/webhooks):
 * - Signature: `X-Notion-Signature: sha256=<hex>` is HMAC-SHA256 of the RAW
 *   request body keyed by NOTION_WEBHOOK_SECRET; verified with a timing-safe
 *   compare. Missing secret → 503 (fail closed); bad/missing signature → 401.
 * - Subscription handshake: when a subscription is first created Notion POSTs
 *   a body containing `verification_token` and no signature header. We log the
 *   token (so the operator can copy it from the Vercel logs into Notion to
 *   confirm the subscription) and return 200. Per the docs the signature check
 *   does not apply to that initial unsigned handshake; every other request
 *   MUST be signed.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const signature = request.headers.get("x-notion-signature");

    let body: unknown = null;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = null;
    }

    // Subscription-verification handshake: unsigned, carries only a
    // verification_token. Log it clearly and acknowledge — this is the one
    // request the signature check legitimately does not cover.
    if (
      !signature &&
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).verification_token === "string"
    ) {
      const token = (body as Record<string, unknown>).verification_token;
      console.log(
        `[NotionWebhook] subscription verification_token (copy into Notion to confirm): ${String(token)}`,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const secret = process.env.NOTION_WEBHOOK_SECRET;
    // Fail closed: without the shared secret we cannot verify a single event,
    // so we must never process one.
    if (!secret) {
      console.error(
        "[NotionWebhook] NOTION_WEBHOOK_SECRET is not configured — refusing to process events",
      );
      return NextResponse.json(
        { error: "NOTION_WEBHOOK_SECRET is not configured" },
        { status: 503 },
      );
    }

    if (!signature || !verifySignature(raw, signature, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verified. Read ONLY ids from the payload — never its content.
    const candidateIds = extractDatabaseCandidateIds(body);
    if (candidateIds.length === 0) {
      // A verified event we can't tie to any database (thin/unknown shape) is
      // a no-op, not an error.
      return NextResponse.json({ ok: true, matched: 0 }, { status: 200 });
    }

    const result = await triggerWebhookInboundSync(db, new Date(), candidateIds);
    return NextResponse.json(
      { ok: true, matched: result.matched, items: result.items },
      { status: 200 },
    );
  } catch (error) {
    console.error("[NotionWebhook] handler failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Timing-safe check that `X-Notion-Signature` (`sha256=<hex>`) equals the
 * HMAC-SHA256 of the raw body under the shared secret. A bare hex value (no
 * prefix) is tolerated so a differing header convention can't strand events.
 */
function verifySignature(raw: string, header: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const provided = header.includes("=") ? header : `sha256=${header}`;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
