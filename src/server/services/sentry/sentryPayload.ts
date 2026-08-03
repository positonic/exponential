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
  /**
   * Sentry project slug the issue belongs to (e.g. "exponential-frontend").
   * The webhook is org-wide, so this is how we tell this app's errors from
   * other services' (mastra-agents). Null when the payload omits it.
   */
  projectSlug: string | null;
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
      project?: { slug?: string };
    };
    event?: {
      issue_id?: string | number;
      title?: string;
      level?: string;
      culprit?: string;
      web_url?: string;
      project_slug?: string;
    };
  };
}

/**
 * Minimal view of a GlitchTip *generic* (Slack-compatible) webhook body.
 *
 * GlitchTip has two outbound webhook modes. Its Sentry-compatible mode sends
 * the nested `{action, data.issue}` shape handled above; its generic mode —
 * the one its Alert Rule UI offers by default — sends this flat, Slack-styled
 * shape instead, with no `Sentry-Hook-Resource` header.
 */
interface GlitchtipWebhookBody {
  /** Event type slug, e.g. "issue.new" / "issue.resolved". Sometimes a bot name. */
  alias?: string;
  /** Human-readable summary; often boilerplate like "GlitchTip Alert". */
  text?: string;
  /** GlitchTip sends the issue id at the top level. */
  issue_id?: string | number;
  /** Project slug as a bare string (Sentry nests it under `project.slug`). */
  project?: string | { slug?: string };
  culprit?: string;
  level?: string;
  /** Slack-style content — the real error title/link live here. */
  attachments?: {
    title?: string;
    title_link?: string;
    text?: string;
  }[];
}

/**
 * Aliases we file a bug for. Anything else dotted (`issue.resolved`,
 * `issue.archived`, …) is ignored. Dedup makes a mistake here cheap — a second
 * event for a known issue id collapses onto the existing ticket — but not
 * filing on resolutions keeps the backlog honest.
 */
const GLITCHTIP_NEW_ISSUE_ALIASES = ["issue.new", "issue.regression"];

/** Trailing issue id in a GlitchTip issue URL: `…/issues/12345`. */
const GLITCHTIP_ISSUE_URL = /\/issues\/(\d+)/;

/**
 * Turn a GlitchTip generic-webhook body into a normalized {@link SentryBug}, or
 * `null` if it isn't a new-issue event we file.
 */
export function normalizeGlitchtipPayload(body: unknown): SentryBug | null {
  const payload = (body ?? {}) as GlitchtipWebhookBody;

  // `alias` is the event type when dotted. Some GlitchTip versions put a bot
  // name there instead, so only *dotted* values are treated as a filter —
  // otherwise we'd ignore every event on a deployment that sends "GlitchTip".
  const alias = payload.alias;
  if (
    typeof alias === "string" &&
    alias.includes(".") &&
    !GLITCHTIP_NEW_ISSUE_ALIASES.includes(alias)
  ) {
    return null;
  }

  const attachment = payload.attachments?.[0];
  const url = attachment?.title_link ?? null;

  // Prefer the explicit id; fall back to parsing the issue URL so this still
  // works on versions that omit `issue_id`. Without either we have no dedup
  // key, so the event is not fileable.
  const issueId =
    payload.issue_id !== undefined && payload.issue_id !== null
      ? String(payload.issue_id)
      : (GLITCHTIP_ISSUE_URL.exec(url ?? "")?.[1] ?? null);
  if (!issueId) return null;

  // The attachment title carries the actual error; `text` is often boilerplate.
  const title = attachment?.title ?? payload.text ?? "Untitled GlitchTip issue";

  const projectSlug =
    typeof payload.project === "string"
      ? payload.project
      : (payload.project?.slug ?? null);

  return {
    issueId,
    title,
    level: payload.level ?? null,
    culprit: payload.culprit ?? null,
    url,
    // GlitchTip's generic payload has no Sentry-style short id.
    shortId: null,
    projectSlug,
  };
}

/**
 * Normalize an inbound issue webhook from either sender.
 *
 * Sentry always sends a `Sentry-Hook-Resource` header; GlitchTip's generic
 * webhook sends none, so its absence is the discriminator.
 */
export function normalizeIssueWebhook(
  resource: string | null,
  body: unknown,
): SentryBug | null {
  return resource
    ? normalizeSentryPayload(resource, body)
    : normalizeGlitchtipPayload(body);
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
 * Verify a shared-secret webhook token sent in a plain request header.
 *
 * An alternative to HMAC for senders that can set custom headers but can't sign
 * the body (e.g. Glitchtip, which is Sentry-API-compatible but has no HMAC
 * signing yet). The sender puts the secret verbatim in `X-Webhook-Token`; we
 * compare it constant-time against `SENTRY_WEBHOOK_TOKEN`. Weaker than HMAC — it
 * proves the sender knows the secret but not that the body is untampered — yet
 * far better than an open endpoint.
 */
export function verifyWebhookToken(
  provided: string,
  expected: string,
): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
      projectSlug: issue.project?.slug ?? null,
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
      projectSlug: event.project_slug ?? null,
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
