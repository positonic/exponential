import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  normalizeIssueWebhook,
  verifySentrySignature,
  verifyWebhookToken,
} from "~/server/services/sentry/sentryPayload";
import { getDecryptedKey } from "~/server/utils/credentialHelper";

/**
 * Workspace-scoped Sentry → Exponential bug webhook.
 *
 * The per-workspace counterpart to the global `/api/webhooks/sentry` route: each
 * workspace configures a Sentry integration (see `createSentryIntegration`) and
 * gets its own URL segment (`webhookId`) plus its own signing secret. This route
 * looks the integration up by `webhookId`, verifies the HMAC against *that*
 * integration's stored secret, and files the issue as a Bug Ticket in the
 * workspace's chosen destination Product (`providerConfig.productId`).
 *
 * Unlike the global route there is no shared env secret and no unauthenticated
 * mode: a configured integration always has a secret, and every request must
 * prove knowledge of it one of two ways.
 *
 *  - **Sentry** signs the raw body — `Sentry-Hook-Signature` must verify by
 *    HMAC against the integration's secret. Whenever a signature is present it
 *    must be valid; there is no falling back to the weaker gate.
 *  - **GlitchTip's generic webhook** cannot sign and cannot set headers (its
 *    Alert Rule UI takes only a URL), so it may instead present the same
 *    secret verbatim as a `?token=` query param, compared constant-time. This
 *    is strictly weaker — it proves the sender knows the secret but not that
 *    the body is untampered, and query strings are more prone to landing in
 *    proxy logs — so it is accepted only when no signature was offered.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  try {
    const { webhookId } = await params;
    const signature = request.headers.get("sentry-hook-signature");
    const resource = request.headers.get("sentry-hook-resource");
    const rawBody = await request.text();

    // Resolve the tenant from the URL. A single indexed lookup on the unique
    // `webhookId`; unknown ids (or a non-sentry integration) are a 404.
    const integration = await db.integration.findUnique({
      where: { webhookId },
      select: {
        id: true,
        provider: true,
        status: true,
        providerConfig: true,
        credentials: {
          where: { keyType: "WEBHOOK_SECRET" },
          select: { key: true, isEncrypted: true },
        },
      },
    });

    if (!integration || integration.provider !== "sentry") {
      return NextResponse.json(
        { error: "Unknown Sentry webhook" },
        { status: 404 },
      );
    }

    // Verify the signature against this integration's own secret.
    const secretCred = integration.credentials[0];
    const secret = secretCred ? getDecryptedKey(secretCred) : null;
    if (!secret) {
      // Integration exists but its secret is missing/undecryptable — treat as
      // misconfigured rather than silently accepting unsigned traffic.
      console.error(
        `[sentry webhook ${webhookId}] no usable signing secret on integration ${integration.id}`,
      );
      return NextResponse.json(
        { error: "Integration misconfigured" },
        { status: 401 },
      );
    }

    if (signature) {
      // A signature was offered: it must verify. No fallback to the token gate.
      if (!verifySentrySignature(rawBody, signature, secret)) {
        console.error(`[sentry webhook ${webhookId}] invalid signature`);
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    } else {
      // Unsigned (GlitchTip): the same secret must be presented verbatim.
      const provided =
        request.headers.get("x-webhook-token") ??
        request.nextUrl.searchParams.get("token");
      if (!provided || !verifyWebhookToken(provided, secret)) {
        console.error(
          `[sentry webhook ${webhookId}] unsigned request with invalid or missing token`,
        );
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    if (integration.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Integration is not active" },
        { status: 403 },
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

    const config = integration.providerConfig as { productId?: string } | null;
    const productId = config?.productId;
    if (!productId) {
      console.error(
        `[sentry webhook ${webhookId}] integration ${integration.id} has no destination product`,
      );
      return NextResponse.json(
        { error: "Integration has no destination product" },
        { status: 500 },
      );
    }

    // Which codebase the error came from, for labelling. `service` is the
    // canonical name; `product` is accepted as an alias because it reads
    // naturally in a URL — note it does *not* choose the destination Product,
    // which is fixed per integration.
    const sourceSlug =
      request.nextUrl.searchParams.get("service") ??
      request.nextUrl.searchParams.get("product");

    const result = await ingestSentryBug(db, bug, { productId, sourceSlug });
    console.log(
      `[sentry webhook ${webhookId}] issue ${bug.issueId} -> ticket ${result.ticketId} (created=${result.created})`,
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
