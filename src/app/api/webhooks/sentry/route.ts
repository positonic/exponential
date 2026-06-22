import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  normalizeSentryPayload,
  verifySentrySignature,
  verifyWebhookToken,
} from "~/server/services/sentry/sentryPayload";

/**
 * Sentry → Exponential bug webhook (ADR-0027).
 *
 * Configure a Sentry internal integration to POST here on the `issue` (created)
 * resource. Each new Sentry issue becomes a Bug Ticket (`type: BUG`,
 * `status: BACKLOG`) in the configured product, authored by the Errol system
 * user. Recurring errors are collapsed onto one ticket in a later slice (dedup).
 *
 * Auth: two independent gates, each active only when its env var is set.
 *  - `SENTRY_WEBHOOK_TOKEN`: a shared secret the sender echoes in the
 *    `X-Webhook-Token` header. For senders that can set headers but can't sign
 *    the body (e.g. Glitchtip, which has no HMAC signing yet).
 *  - `SENTRY_WEBHOOK_SECRET`: real Sentry signs the raw body with HMAC-SHA256
 *    using the integration's Client Secret and sends it in
 *    `Sentry-Hook-Signature`. Verification is one-way, like the GitHub webhook.
 * If both are set, both must pass; if neither is set, the endpoint is open
 * (logged). Configure at least one in any internet-facing deployment.
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("sentry-hook-signature");
    const resource = request.headers.get("sentry-hook-resource");
    const rawBody = await request.text();

    const token = process.env.SENTRY_WEBHOOK_TOKEN;
    if (token) {
      const provided = request.headers.get("x-webhook-token");
      if (!provided || !verifyWebhookToken(provided, token)) {
        console.error("[sentry webhook] invalid or missing webhook token");
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const secret = process.env.SENTRY_WEBHOOK_SECRET;
    if (secret) {
      if (!signature || !verifySentrySignature(rawBody, signature, secret)) {
        console.error("[sentry webhook] invalid signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    if (!token && !secret) {
      console.warn(
        "[sentry webhook] neither SENTRY_WEBHOOK_TOKEN nor SENTRY_WEBHOOK_SECRET set - endpoint is unauthenticated",
      );
    }

    if (!resource) {
      return NextResponse.json(
        { error: "Missing Sentry-Hook-Resource header" },
        { status: 400 },
      );
    }

    const bug = normalizeSentryPayload(resource, JSON.parse(rawBody) as unknown);
    if (!bug) {
      // Not an event we file as a bug (installation, comment, resolved, etc.).
      return NextResponse.json({ message: `Ignored Sentry ${resource} event` });
    }

    const result = await ingestSentryBug(db, bug);
    console.log(
      `[sentry webhook] issue ${bug.issueId} -> ticket ${result.ticketId} (created=${result.created})`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sentry webhook] processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
