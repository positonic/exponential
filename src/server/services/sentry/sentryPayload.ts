import crypto from "crypto";

/**
 * Pure (DB-free) helpers for the Sentry → Exponential bug webhook.
 *
 * Kept separate from `SentryBugService` so signature verification and payload
 * normalization can be unit-tested without pulling in Prisma. See ADR-0027.
 */

/** Normalized shape we turn into a Bug Ticket, regardless of which Sentry resource fired. */
export interface SentryBug {
  /** Stable Sentry issue id — the dedup key (stored in `Ticket.links`). */
  issueId: string;
  title: string;
  level: string | null;
  culprit: string | null;
  /** Human-facing link into the Sentry UI. */
  url: string | null;
  /** Short, friendly id like "EXPONENTIAL-1AB" (only present on the `issue` resource). */
  shortId: string | null;
}

/** Minimal view of the Sentry webhook body — only the fields we read. */
interface SentryWebhookBody {
  action?: string;
  data?: {
    issue?: {
      id?: string | number;
      title?: string;
      level?: string;
      culprit?: string;
      permalink?: string;
      shortId?: string;
    };
    event?: {
      issue_id?: string | number;
      title?: string;
      level?: string;
      culprit?: string;
      web_url?: string;
    };
  };
}

/**
 * Verify a Sentry integration-platform webhook signature.
 *
 * Sentry signs the raw request body with HMAC-SHA256 using the integration's
 * Client Secret and sends the hex digest in the `Sentry-Hook-Signature` header
 * (no `sha256=` prefix, unlike GitHub).
 */
export function verifySentrySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so guard first.
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(provided, computed);
}

/**
 * Turn a Sentry webhook body into a normalized {@link SentryBug}, or `null` if
 * the event isn't one we file as a bug.
 *
 * We file on:
 *  - `issue` resource, action `created` (a brand-new issue) — preferred.
 *  - `event_alert` resource, action `triggered` (a Sentry alert rule fired).
 *
 * Both key on the Sentry issue id, so dedup collapses an alert and an
 * `issue/created` for the same underlying issue onto one ticket. Every other
 * resource/action returns `null` (the route answers `200` with no ticket).
 *
 * Accepts `unknown` because the body comes straight from `JSON.parse` — it is
 * narrowed to the small shape we read here.
 */
export function normalizeSentryPayload(
  resource: string,
  body: unknown,
): SentryBug | null {
  const payload = (body ?? {}) as SentryWebhookBody;

  if (resource === "issue" && payload.action === "created") {
    const issue = payload.data?.issue;
    if (!issue?.id) return null;
    return {
      issueId: String(issue.id),
      title: issue.title ?? "Untitled Sentry issue",
      level: issue.level ?? null,
      culprit: issue.culprit ?? null,
      url: issue.permalink ?? null,
      shortId: issue.shortId ?? null,
    };
  }

  if (resource === "event_alert" && payload.action === "triggered") {
    const event = payload.data?.event;
    if (!event?.issue_id) return null;
    return {
      issueId: String(event.issue_id),
      title: event.title ?? "Untitled Sentry issue",
      level: event.level ?? null,
      culprit: event.culprit ?? null,
      url: event.web_url ?? null,
      // `event_alert` payloads don't carry a short id.
      shortId: null,
    };
  }

  return null;
}

/**
 * Build the Markdown body stored on the Bug Ticket (the canonical content
 * format, ADR-0017): a provenance line, level / culprit / short-id metadata,
 * and a deep link back into Sentry.
 */
export function buildBugBody(bug: SentryBug): string {
  const lines: string[] = ["Reported automatically from Sentry.", ""];
  if (bug.level) lines.push(`- **Level:** ${bug.level}`);
  if (bug.culprit) lines.push(`- **Culprit:** ${bug.culprit}`);
  if (bug.shortId) lines.push(`- **Sentry issue:** ${bug.shortId}`);
  if (bug.url) {
    lines.push("");
    lines.push(`[View in Sentry](${bug.url})`);
  }
  return lines.join("\n");
}
