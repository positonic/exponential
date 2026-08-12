/**
 * Turning a meeting into the message that lands in a room.
 *
 * Matrix messages carry a plain-text `body` and an optional HTML `formatted_body`;
 * clients that cannot render HTML fall back to the text, so both are built rather than
 * one being derived from the other at display time.
 *
 * `TranscriptionSession.summary` is a JSON *string* and malformed values exist in the
 * data — `TranscriptionProcessingService` already wraps its own `JSON.parse` in a
 * try/catch for this reason. A summary that will not parse is treated as prose rather
 * than discarded: the text is what the reader wants, and losing it to a parse error
 * would be worse than showing it unstructured.
 */

import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export interface MeetingForSummary {
  id: string;
  title: string | null;
  summary: string | null;
  meetingDate: Date | null;
  createdAt: Date;
  workspaceId: string | null;
  project: { id: string; name: string } | null;
  actions: { id: string }[];
}

export interface RenderedSummary {
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pull readable prose out of whatever shape the summary is in.
 *
 * Fireflies-derived summaries are objects with named sections; older and hand-written
 * ones are plain strings. Both reach this function.
 */
export function extractSummaryText(rawSummary: string): string {
  const trimmed = rawSummary.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON at all — it is already the prose we want.
    return trimmed;
  }

  if (typeof parsed === "string") return parsed.trim();
  if (parsed === null || typeof parsed !== "object") return trimmed;

  const record = parsed as Record<string, unknown>;
  const sections: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    const rendered = renderSection(value);
    if (!rendered) continue;
    sections.push(`${humanizeKey(key)}\n${rendered}`);
  }

  // An object we could not get any prose out of is more useful shown raw than dropped.
  return sections.length > 0 ? sections.join("\n\n") : trimmed;
}

function renderSection(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : null))
      .filter((entry): entry is string => !!entry)
      .map((entry) => `• ${entry}`);
    return items.length > 0 ? items.join("\n") : null;
  }
  return null;
}

/** `action_items` / `actionItems` → `Action items`. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The absolute link back. Relative paths are useless here: most readers are in a Matrix
 * client, not in the app, and some of them are not Exponential users at all.
 */
export function meetingUrl(meeting: MeetingForSummary): string {
  // Same resolution the Matrix DM channel and email use, so deep links point at one
  // origin everywhere. Safe outside a request scope, which matters because posting can
  // be driven from anywhere.
  const origin = process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();
  // `/recording/{id}` is the meeting detail page — `/meetings` is the list, and has no
  // per-meeting route, so linking there would land readers on someone else's inbox.
  return `${origin.replace(/\/+$/, "")}/recording/${meeting.id}`;
}

function formatMeetingDate(meeting: MeetingForSummary): string {
  const date = meeting.meetingDate ?? meeting.createdAt;
  return date.toISOString().slice(0, 10);
}

export function renderMeetingSummary(meeting: MeetingForSummary): RenderedSummary {
  const title = meeting.title?.trim() ?? "Untitled meeting";
  const date = formatMeetingDate(meeting);
  const body = meeting.summary ? extractSummaryText(meeting.summary) : "";
  const actionCount = meeting.actions.length;
  const actionLine = `${actionCount} action item${actionCount === 1 ? "" : "s"}`;
  const url = meetingUrl(meeting);
  const project = meeting.project?.name;

  const textParts = [
    `📋 ${title}`,
    project ? `${date} · ${project}` : date,
    "",
    body,
    "",
    actionLine,
    url,
  ];

  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const html = [
    `<h4>📋 ${escapeHtml(title)}</h4>`,
    `<p><em>${escapeHtml(project ? `${date} · ${project}` : date)}</em></p>`,
    `<p>${htmlBody}</p>`,
    `<p>${escapeHtml(actionLine)} — <a href="${escapeHtml(url)}">open in Exponential</a></p>`,
  ].join("");

  return { text: textParts.join("\n").trim(), html };
}
