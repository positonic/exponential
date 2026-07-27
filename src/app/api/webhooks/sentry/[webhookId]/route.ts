import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  normalizeSentryPayload,
  verifySentrySignature,
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
 * Unlike the global route, there is no shared env secret and no unauthenticated
 * mode — a configured integration always has a secret, so every request must
 * carry a valid `Sentry-Hook-Signature`.
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

    if (!signature || !verifySentrySignature(rawBody, signature, secret)) {
      console.error(`[sentry webhook ${webhookId}] invalid signature`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (integration.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Integration is not active" },
        { status: 403 },
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

    const result = await ingestSentryBug(db, bug, { productId });
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
