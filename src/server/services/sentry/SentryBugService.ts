import type { Prisma, PrismaClient } from "@prisma/client";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { ticketUrlId } from "~/lib/fun-ids";
import { buildBugBody, type SentryBug } from "./sentryPayload";
import { notifyZulipOfSentryBug } from "./sentryZulip";
import { notifyMatrixOfSentryBug } from "./sentryMatrix";

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

// Workspace labels applied to every Sentry-filed ticket. `avatar-plum` ≈ Sentry's
// purple; `avatar-red` for the bug label.
const TICKET_LABELS = [
  { name: "Sentry", slug: "sentry", color: "avatar-plum" },
  { name: "bug", slug: "bug", color: "avatar-red" },
] as const;

// Marks the ticket as a candidate for the AI bug fixer. The workflow's real
// gate is status READY_TO_PLAN (see .github/workflows/ai-bug-fixer.yml) — this
// label alone does not start a run, so a human still triages the ticket out of
// BACKLOG before any agent touches it.
/**
 * Colour for the per-service source label (see {@link sourceLabel}).
 */
const SOURCE_LABEL_COLOR = "avatar-blue";

/** Upper bound on a generated label slug, so a hostile value can't bloat a tag. */
const SOURCE_SLUG_MAX_LENGTH = 32;

/**
 * Build a label identifying which service an error came from, so a single
 * destination product can carry bugs from several codebases and still be
 * filterable (`clear-api` vs `clear-pipeline` …).
 *
 * The value arrives either from the webhook's `?service=` query param or, when
 * absent, from the sender's own project slug. Both are attacker-influencable in
 * principle — the token gate makes them semi-trusted at best — so the string is
 * reduced to a bounded `[a-z0-9-]` slug rather than used verbatim.
 */
export function sourceLabel(
  raw: string | null | undefined,
): { name: string; slug: string; color: string } | null {
  if (!raw) return null;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SOURCE_SLUG_MAX_LENGTH)
    // A trailing dash can survive the truncation above.
    .replace(/-+$/g, "");
  if (!slug) return null;
  return { name: slug, slug, color: SOURCE_LABEL_COLOR };
}

const AI_FIXABLE_LABEL = {
  name: "ai-fixable",
  slug: "ai-fixable",
  color: "avatar-blue",
} as const;

/**
 * Whether a Sentry issue's project maps to *this* codebase. The webhook is
 * org-wide, so mastra-agents errors arrive here too — labelling those
 * `ai-fixable` would point the fixer (which checks out this repo) at a bug
 * that doesn't live here.
 *
 * `SENTRY_AI_FIXABLE_PROJECTS` is a comma-separated allowlist of Sentry
 * project slugs. Unset ⇒ no ticket is labelled, so enabling the behaviour is
 * an explicit, per-environment opt-in.
 */
function isAiFixableProject(projectSlug: string | null): boolean {
  const allowlist = (process.env.SENTRY_AI_FIXABLE_PROJECTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0 || !projectSlug) return false;
  return allowlist.includes(projectSlug);
}

/**
 * Find-or-create each workspace label and attach it to the ticket. Idempotent
 * (both upserts) and best-effort — a tagging failure is logged but never breaks
 * ingestion, since the ticket itself is already created. An existing tag keeps
 * its current colour (the create branch only runs on first use).
 */
async function labelTicket(
  db: PrismaClient,
  ticketId: string,
  workspaceId: string,
  authorId: string,
  labels: readonly { name: string; slug: string; color: string }[],
): Promise<void> {
  for (const label of labels) {
    try {
      const tag = await db.tag.upsert({
        where: { slug_workspaceId: { slug: label.slug, workspaceId } },
        create: {
          name: label.name,
          slug: label.slug,
          color: label.color,
          category: "label",
          workspaceId,
          createdById: authorId,
        },
        update: {},
        select: { id: true },
      });
      await db.ticketTag.upsert({
        where: { ticketId_tagId: { ticketId, tagId: tag.id } },
        create: { ticketId, tagId: tag.id },
        update: {},
      });
    } catch (error) {
      console.error(
        `[sentry webhook] failed to attach ${label.name} label:`,
        error,
      );
    }
  }
}

export interface IngestResult {
  created: boolean;
  ticketId: string;
}

/**
 * Whether a recurring error is due another announcement. `lastNotifiedAt`
 * lives in the ticket's `links` JSON so the throttle survives across
 * serverless invocations without a schema change; a ticket that predates it
 * (no timestamp) is due.
 */
export function isDueForRenotify(
  links: Prisma.JsonValue | null,
  renotifyAfterMs: number,
  now: Date,
): boolean {
  const last =
    links && typeof links === "object" && !Array.isArray(links)
      ? links.lastNotifiedAt
      : undefined;
  if (typeof last !== "string") return true;
  const lastMs = Date.parse(last);
  return Number.isNaN(lastMs) || now.getTime() - lastMs >= renotifyAfterMs;
}

export async function ingestSentryBug(
  db: PrismaClient,
  bug: SentryBug,
  options?: {
    productId?: string;
    sourceSlug?: string | null;
    /**
     * Ticket body, when the caller isn't Sentry. Defaults to `buildBugBody`,
     * which opens with "Reported automatically from Sentry" — true for the
     * webhook, a lie for anything else (see `clientErrorBug`).
     */
    body?: string;
    /**
     * Labels in place of the default "Sentry" + "bug" pair. A handled client
     * error is a bug, but it did not come from Sentry, and filtering on that
     * label should keep meaning what it says.
     */
    labels?: readonly { name: string; slug: string; color: string }[];
    /** Lead-in for the creation announcement. Defaults to "New Sentry bug". */
    heading?: string;
    /**
     * Re-announce a recurring error at most once per this many ms instead of
     * only on creation. For failures that need a person *now* every time they
     * keep happening (an exhausted provider account), where one ping on a
     * months-old ticket is easy to miss. Unset ⇒ creation-only, as before.
     */
    renotifyAfterMs?: number;
  },
): Promise<IngestResult> {
  // Destination precedence: an explicit per-workspace product (from a
  // workspace-scoped Sentry integration) wins; otherwise fall back to the
  // global env default, then the hardcoded Exponential product. This keeps the
  // legacy global `/api/webhooks/sentry` route working unchanged.
  const productId =
    options?.productId ??
    process.env.SENTRY_BUG_PRODUCT_ID ??
    DEFAULT_BUG_PRODUCT_ID;
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      workspace: { select: { slug: true } },
    },
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
    select: { id: true, number: true, links: true, updatedAt: true },
  });
  const now = new Date();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.exponential.im";
  const ticketUrlFor = (ticket: { id: string; number: number }) =>
    `${baseUrl}/w/${product.workspace.slug}/products/${product.slug}/tickets/${ticketUrlId(ticket)}`;

  if (existing) {
    const renotifyAfterMs = options?.renotifyAfterMs;
    if (
      renotifyAfterMs !== undefined &&
      isDueForRenotify(existing.links, renotifyAfterMs, now)
    ) {
      // Claim the slot before announcing, so a failed send is not retried on
      // every request in a burst. The claim is a compare-and-set on
      // `updatedAt`: during an outage every turn fails at once, and several
      // requests can all read the ticket as due. Only the one whose write
      // still sees the row it read wins; the rest find it changed and stay
      // quiet.
      const links =
        existing.links && typeof existing.links === "object" && !Array.isArray(existing.links)
          ? existing.links
          : {};
      const claim = await db.ticket.updateMany({
        where: { id: existing.id, updatedAt: existing.updatedAt },
        data: { links: { ...links, lastNotifiedAt: now.toISOString() } },
      });
      if (claim.count === 0) {
        return { created: false, ticketId: existing.id };
      }
      const errol = await findOrCreateErrol(db);
      const repeat = {
        workspaceId: product.workspaceId,
        authorId: errol.id,
        title: bug.title,
        ticketUrl: ticketUrlFor(existing),
        sentryUrl: bug.url,
        heading: "Still happening",
      };
      await notifyZulipOfSentryBug(db, repeat);
      await notifyMatrixOfSentryBug(repeat);
    }
    return { created: false, ticketId: existing.id };
  }

  const errol = await findOrCreateErrol(db);

  const ticket = await createTicketWithNumber(db, {
    productId: product.id,
    workspaceId: product.workspaceId,
    createdById: errol.id,
    title: bug.title,
    body: options?.body ?? buildBugBody(bug),
    type: "BUG",
    status: "BACKLOG",
    // Priority is left unset — a human assigns it during triage.
    // `sentryIssueId` stays the key for non-Sentry origins too: it is the dedup
    // path queried above, and a second path would mean a second lookup for no
    // gain. The value's `client:` prefix says where it came from.
    links: {
      sentryIssueId: bug.issueId,
      sentryUrl: bug.url,
      // Creation announces below, so the repeat-alert clock starts now.
      ...(options?.renotifyAfterMs !== undefined
        ? { lastNotifiedAt: now.toISOString() }
        : {}),
    },
  });

  // Tag it so these are filterable. `labelTicket` now takes the complete set
  // rather than prepending its own, so the origin's labels are named here.
  const source = sourceLabel(options?.sourceSlug ?? bug.projectSlug);
  await labelTicket(db, ticket.id, product.workspaceId, errol.id, [
    // "Sentry" + "bug" unless the caller is not Sentry and says otherwise.
    ...(options?.labels ?? TICKET_LABELS),
    ...(isAiFixableProject(bug.projectSlug) ? [AI_FIXABLE_LABEL] : []),
    // Which codebase this came from. An explicit `?service=` wins; otherwise
    // fall back to the slug the sender put in the payload.
    ...(source ? [source] : []),
  ]);

  // Announce the new bug in Zulip and Matrix (best-effort) with a deep link to
  // the ticket. Recurring errors that dedup above re-notify only when the
  // caller asked for it via `renotifyAfterMs`.
  const bugNotification = {
    workspaceId: product.workspaceId,
    authorId: errol.id,
    title: bug.title,
    ticketUrl: ticketUrlFor(ticket),
    sentryUrl: bug.url,
    ...(options?.heading ? { heading: options.heading } : {}),
  };
  await notifyZulipOfSentryBug(db, bugNotification);
  await notifyMatrixOfSentryBug(bugNotification);

  return { created: true, ticketId: ticket.id };
}
