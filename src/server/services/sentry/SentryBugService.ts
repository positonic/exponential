import type { PrismaClient } from "@prisma/client";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { buildBugBody, type SentryBug } from "./sentryPayload";

/**
 * Ingests a normalized {@link SentryBug} as a Bug Ticket in Exponential.
 *
 * Runs in-process (direct Prisma access) — the webhook route lives inside this
 * app, so no API token / JWT is involved. The ticket is authored by the
 * **Errol** system user (find-or-created lazily) and created through the shared
 * `createTicketWithNumber` service. See ADR-0027.
 *
 * Access control is intentionally absent: the route already verified Sentry's
 * signature, and Errol is not a workspace member (so the usual membership check
 * would reject it). We load the product directly for the `workspaceId` the
 * activity write needs.
 */

// The Exponential product is the default bug destination (overridable via env).
const DEFAULT_BUG_PRODUCT_ID = "cmp2ztu9y0003jv04kk2l8sm0";
const DEFAULT_BOT_EMAIL = "errol@bots.exponential.im";
const DEFAULT_BOT_NAME = "Errol";

/**
 * Find-or-create the Errol system user. A real `User` row that never signs in
 * and is not a `WorkspaceUser` — it exists purely to author Sentry-filed bugs.
 */
async function findOrCreateErrol(db: PrismaClient): Promise<{ id: string }> {
  const email = process.env.SENTRY_BOT_EMAIL ?? DEFAULT_BOT_EMAIL;
  const name = process.env.SENTRY_BOT_NAME ?? DEFAULT_BOT_NAME;

  return db.user.upsert({
    where: { email },
    create: { email, name },
    update: {},
    select: { id: true },
  });
}

export interface IngestResult {
  created: boolean;
  ticketId: string;
}

export async function ingestSentryBug(
  db: PrismaClient,
  bug: SentryBug,
): Promise<IngestResult> {
  const productId = process.env.SENTRY_BUG_PRODUCT_ID ?? DEFAULT_BUG_PRODUCT_ID;
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, workspaceId: true },
  });
  if (!product) {
    throw new Error(`Sentry bug product not found: ${productId}`);
  }

  // Dedup: one Ticket per Sentry issue. Look for an existing ticket in this
  // product whose `links` JSON carries the incoming issue id (the same
  // JSON-path filter the activity feed uses on `metadata.provider`). A
  // recurring error collapses onto the existing ticket instead of duplicating.
  const existing = await db.ticket.findFirst({
    where: {
      productId: product.id,
      links: { path: ["sentryIssueId"], equals: bug.issueId },
    },
    select: { id: true },
  });
  if (existing) {
    return { created: false, ticketId: existing.id };
  }

  const errol = await findOrCreateErrol(db);

  const ticket = await createTicketWithNumber(db, {
    productId: product.id,
    workspaceId: product.workspaceId,
    createdById: errol.id,
    title: bug.title,
    body: buildBugBody(bug),
    type: "BUG",
    status: "BACKLOG",
    // Priority is left unset — a human assigns it during triage.
    links: { sentryIssueId: bug.issueId, sentryUrl: bug.url },
  });

  return { created: true, ticketId: ticket.id };
}
