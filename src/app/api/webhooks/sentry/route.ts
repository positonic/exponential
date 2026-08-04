import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  normalizeIssueWebhook,
  verifySentrySignature,
  verifyWebhookToken,
} from "~/server/services/sentry/sentryPayload";

/**
 * Sentry / GlitchTip → Exponential bug webhook (ADR-0027).
 *
 * Each new issue becomes a Bug Ticket (`type: BUG`, `status: BACKLOG`) in the
 * configured product, authored by the Errol system user. Recurring errors are
 * collapsed onto one ticket (dedup on the issue id).
 *
 * Two senders, distinguished by the `Sentry-Hook-Resource` header:
 *  - **Sentry** sends the header plus a nested `{action, data.issue}` body.
 *  - **GlitchTip's generic webhook** sends no header and a flat, Slack-styled
 *    body. Its Alert Rule UI accepts only a URL — no custom headers — so the
 *    shared secret may also travel as a `?token=` query param.
 *
 * Auth: two independent gates, each active only when its env var is set.
 *  - `SENTRY_WEBHOOK_TOKEN`: a shared secret echoed in the `X-Webhook-Token`
 *    header, or (for GlitchTip) the `token` query param. The header is
 *    preferred: query strings are far more likely to be captured in proxy and
 *    access logs, so the param exists only because GlitchTip allows nothing
 *    else.
 *  - `SENTRY_WEBHOOK_SECRET`: real Sentry signs the raw body with HMAC-SHA256
 *    using the integration's Client Secret and sends it in
 *    `Sentry-Hook-Signature`. Verification is one-way, like the GitHub webhook.
 *    GlitchTip cannot sign, so a GlitchTip-only deployment should configure
 *    the token and leave the secret unset.
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
      const provided =
        request.headers.get("x-webhook-token") ??
        request.nextUrl.searchParams.get("token");
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

    // No resource header ⇒ treat as GlitchTip's generic webhook.
    const bug = normalizeIssueWebhook(resource, JSON.parse(rawBody) as unknown);
    if (!bug) {
      // Not an event we file as a bug (installation, comment, resolved, etc.).
      return NextResponse.json({
        message: `Ignored ${resource ?? "glitchtip"} event`,
      });
    }

    // Which codebase the error came from, for labelling (`service`, or
    // `product` as an alias). Does not affect the destination product.
    const sourceSlug =
      request.nextUrl.searchParams.get("service") ??
      request.nextUrl.searchParams.get("product");

    const result = await ingestSentryBug(db, bug, { sourceSlug });
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
