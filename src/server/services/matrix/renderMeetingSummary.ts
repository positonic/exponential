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
 *
 * Summary prose is Markdown (the AI summarizer's `detailed_breakdown` is a themed
 * `##`-sectioned write-up), and Matrix renders neither `##` nor `**` — so both bodies
 * convert it: the HTML body to real tags, the text body to plain text. Without this,
 * rooms see the markup literally.
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

/** One titled block of the outgoing message. */
export interface SummarySection {
  /** Humanized field name ("Overview"); null when the summary is one prose blob. */
  title: string | null;
  /** Markdown-ish content, converted per-format by the text/HTML emitters. */
  content: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pull readable sections out of whatever shape the summary is in.
 *
 * Fireflies-derived summaries are objects with named sections; older and hand-written
 * ones are plain strings. Both reach this function.
 */
export function extractSummarySections(rawSummary: string): SummarySection[] {
  const trimmed = rawSummary.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON at all — it is already the prose we want.
    return [{ title: null, content: trimmed }];
  }

  if (typeof parsed === "string") return [{ title: null, content: parsed.trim() }];
  if (parsed === null || typeof parsed !== "object") {
    return [{ title: null, content: trimmed }];
  }

  const record = parsed as Record<string, unknown>;
  const sections: SummarySection[] = [];

  for (const [key, value] of Object.entries(record)) {
    const rendered = renderSection(value);
    if (!rendered) continue;
    sections.push({ title: humanizeKey(key), content: rendered });
  }

  // An object we could not get any prose out of is more useful shown raw than dropped.
  return sections.length > 0 ? sections : [{ title: null, content: trimmed }];
}

function renderSection(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    // As markdown bullets, so both emitters format them like any other list.
    const items = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : null))
      .filter((entry): entry is string => !!entry)
      .map((entry) => `- ${entry}`);
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

/** Inline markdown (code, bold, links) → HTML. Input must already be escaped. */
function inlineMarkdownToHtml(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Inline markdown → readable plain text (`**x**` → `x`, `[t](u)` → `t (u)`). */
function stripInlineMarkdown(line: string): string {
  return line
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
}

interface ListItem {
  html: string;
  children: ListItem[];
}

/** Emit a parsed bullet tree as properly nested `<ul>`s. */
function renderList(items: ListItem[]): string {
  const lis = items
    .map(
      (item) =>
        `<li>${item.html}${item.children.length > 0 ? renderList(item.children) : ""}</li>`,
    )
    .join("");
  return `<ul>${lis}</ul>`;
}

/**
 * The Markdown subset the summarizer emits (`##` headings, `- ` bullets nested by
 * indentation, `**bold**`, inline code, links) → Matrix-safe HTML. Headings render
 * as bold paragraphs, not `<h*>`: the message already carries its own `<h4>` title
 * and `<h5>` section labels, and a summary's inner headings must sit below both.
 * Unknown constructs degrade to escaped paragraph text — never dropped.
 */
export function markdownToMatrixHtml(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  // Bullet runs are collected into a tree first so nesting emits valid HTML.
  let listRoots: ListItem[] = [];
  let listStack: { depth: number; item: ListItem }[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${paragraph.join("<br/>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (listRoots.length === 0) return;
    out.push(renderList(listRoots));
    listRoots = [];
    listStack = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();

    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      const depth = Math.floor(bullet[1]!.length / 2);
      const item: ListItem = {
        html: inlineMarkdownToHtml(escapeHtml(bullet[2]!)),
        children: [],
      };
      while (listStack.length > 0 && listStack[listStack.length - 1]!.depth >= depth) {
        listStack.pop();
      }
      const parent = listStack[listStack.length - 1];
      if (parent) parent.item.children.push(item);
      else listRoots.push(item);
      listStack.push({ depth, item });
      continue;
    }

    flushList();

    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      out.push(`<p><strong>${inlineMarkdownToHtml(escapeHtml(heading[1]!))}</strong></p>`);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    paragraph.push(inlineMarkdownToHtml(escapeHtml(line)));
  }

  flushList();
  flushParagraph();
  return out.join("");
}

/**
 * The same Markdown subset → plain text for the fallback `body`: heading markers
 * dropped, bullets become `•` (indentation kept), inline markup stripped.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trimEnd();
      const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
      if (bullet) return `${bullet[1]}• ${stripInlineMarkdown(bullet[2]!)}`;
      const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (heading) return stripInlineMarkdown(heading[1]!);
      return stripInlineMarkdown(line);
    })
    .join("\n");
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
  const sections = meeting.summary ? extractSummarySections(meeting.summary) : [];
  const actionCount = meeting.actions.length;
  const actionLine = `${actionCount} action item${actionCount === 1 ? "" : "s"}`;
  const url = meetingUrl(meeting);
  const project = meeting.project?.name;

  const textBody = sections
    .map((s) =>
      s.title
        ? `${s.title}\n${markdownToPlainText(s.content)}`
        : markdownToPlainText(s.content),
    )
    .join("\n\n");

  const textParts = [
    `📋 ${title}`,
    project ? `${date} · ${project}` : date,
    "",
    textBody,
    "",
    actionLine,
    url,
  ];

  const htmlBody = sections
    .map(
      (s) =>
        `${s.title ? `<h5>${escapeHtml(s.title)}</h5>` : ""}${markdownToMatrixHtml(s.content)}`,
    )
    .join("");
  const html = [
    `<h4>📋 ${escapeHtml(title)}</h4>`,
    `<p><em>${escapeHtml(project ? `${date} · ${project}` : date)}</em></p>`,
    htmlBody,
    `<p>${escapeHtml(actionLine)} — <a href="${escapeHtml(url)}">open in Exponential</a></p>`,
  ].join("");

  return { text: textParts.join("\n").trim(), html };
}
