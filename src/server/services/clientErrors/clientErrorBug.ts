import crypto from "crypto";

import { maskTokenLike } from "~/server/utils/redactToolArgs";
import type { SentryBug } from "~/server/services/sentry/sentryPayload";

/**
 * Turning a *handled* client-side failure into a Bug Ticket.
 *
 * The Sentry webhook (ADR-0027) only ever sees errors Sentry itself saw, and
 * Sentry only sees what nobody caught. Every failure the app handles gracefully
 * — a chat turn that renders a calm "try again", a bridge call that logs and
 * carries on — was therefore invisible: no Sentry issue, so no Bug Ticket, so
 * nothing to triage. That is the gap this closes.
 *
 * Deliberately *not* done by having the browser call the Sentry webhook route:
 * that route authenticates by HMAC over the raw body using the integration's
 * client secret, which cannot live in a webview, and it would mean fabricating
 * Sentry issue ids and permalinks that lead nowhere. This files the same shape
 * through the same ingest service, honestly labelled as what it is.
 */

/** A failure the client handled, reported for triage. */
export interface ClientErrorReport {
  /** Where in the app it happened — `chat-stream`, `local-wiki-status`, … */
  area: string;
  /** The classification the UI already made, when it made one. */
  kind?: string;
  /** The thrown error's message. Masked and capped before it lands anywhere. */
  message: string;
  /** Optional context: the agent, the route, the surface. Values are capped. */
  context?: Record<string, string>;
}

/** Longest error text carried into a ticket title. */
const MAX_TITLE_CHARS = 160;
/** Longest single context value rendered in the body. */
const MAX_CONTEXT_CHARS = 200;

/**
 * Failure kinds worth a ticket.
 *
 * A dropped connection on a train is not a defect, and filing it would bury the
 * ones that are — the tracker is for things a person can fix. `auth` is
 * excluded for the same reason: an expired session is the app working as
 * designed. What's left is the model/provider refusing, and the genuinely
 * unclassified, which is exactly the bucket today's "Something went wrong"
 * belonged to.
 */
const REPORTABLE_KINDS = new Set(["model", "unknown"]);

export function shouldFileClientError(kind: string | undefined): boolean {
  // No classification at all means nobody decided this was benign.
  return kind === undefined || REPORTABLE_KINDS.has(kind);
}

/**
 * Stable id for "this error, again".
 *
 * The ingest service dedups on it, so the fingerprint decides whether a
 * recurring failure collapses onto one ticket or files a hundred. Built from
 * the area, the kind and the *message*, so two different faults in the same
 * component stay separate — at the cost of a message carrying a request id
 * splitting into many. Numbers are stripped for exactly that reason.
 */
export function fingerprintClientError(report: ClientErrorReport): string {
  const normalized = maskTokenLike(report.message)
    .toLowerCase()
    // Ids, timestamps, byte counts — the parts that differ between two
    // occurrences of the same fault.
    .replace(/\d+/g, "#")
    .trim();
  const digest = crypto
    .createHash("sha1")
    .update(`${report.area}|${report.kind ?? ""}|${normalized}`)
    .digest("hex")
    .slice(0, 12);
  return `client:${report.area}:${digest}`;
}

/** A workspace label attached to a filed ticket. */
export interface ClientErrorLabel {
  name: string;
  slug: string;
  color: string;
}

/**
 * "bug" so it sits with the Sentry-filed ones; "client-error" instead of
 * "Sentry" so the Sentry label keeps meaning the thing it says.
 */
const CLIENT_ERROR_LABELS: readonly ClientErrorLabel[] = [
  { name: "client-error", slug: "client-error", color: "avatar-orange" },
  { name: "bug", slug: "bug", color: "avatar-red" },
];

const CHAT_ERROR_LABEL: ClientErrorLabel = {
  name: "chat-error",
  slug: "chat-error",
  color: "avatar-teal",
};

/**
 * Areas where the failure was a turn with the assistant: the browser's stream
 * reader, the stream route, the agent behind it, and Zoe's canvas stream.
 * A new assistant surface that reports handled errors adds its area here.
 */
const CHAT_ERROR_AREAS = new Set([
  "chat-stream",
  "chat-stream-server",
  "agent-stream",
  "agent-tool",
  "zoe-canvas-stream",
]);

/**
 * The labels a handled-error ticket is filed under. Assistant failures get
 * "chat-error" on top, so they can be listed apart from the rest of the app.
 */
export function clientErrorLabels(area: string): readonly ClientErrorLabel[] {
  return CHAT_ERROR_AREAS.has(area)
    ? [...CLIENT_ERROR_LABELS, CHAT_ERROR_LABEL]
    : CLIENT_ERROR_LABELS;
}

/** Trim a string for display, marking the cut so nobody reads it as complete. */
function cap(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Normalize a report into the shape the bug ingest already understands.
 *
 * `projectSlug` is deliberately null: it is what gates the `ai-fixable` label,
 * and a handled client error has no stack and no Sentry issue to work from, so
 * pointing the fixer at one would waste a run. A human triages these.
 */
export function buildClientErrorBug(report: ClientErrorReport): SentryBug {
  const message = cap(maskTokenLike(report.message), MAX_TITLE_CHARS);
  return {
    issueId: fingerprintClientError(report),
    title: `${report.area}: ${message || "handled error with no message"}`,
    level: "error",
    culprit: report.area,
    url: null,
    shortId: null,
    projectSlug: null,
  };
}

/**
 * The ticket body. Separate from `buildBugBody` because that one opens with
 * "Reported automatically from Sentry", which would be untrue here.
 */
export function buildClientErrorBody(report: ClientErrorReport): string {
  const lines: string[] = [
    "Reported automatically from the app — a failure the UI handled gracefully, so it never reached Sentry.",
    "",
    `- **Area:** ${report.area}`,
  ];
  if (report.kind) lines.push(`- **Failure kind:** ${report.kind}`);
  for (const [key, value] of Object.entries(report.context ?? {})) {
    lines.push(`- **${key}:** ${cap(maskTokenLike(value), MAX_CONTEXT_CHARS)}`);
  }
  lines.push("", "```", cap(maskTokenLike(report.message), 1000), "```");
  return lines.join("\n");
}
