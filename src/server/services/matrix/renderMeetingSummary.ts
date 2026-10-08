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

import { formatDecisionLabel } from "~/lib/decision-label";
import { withMeetingTab } from "~/lib/meeting-tabs";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export interface MeetingForSummary {
  id: string;
  title: string | null;
  summary: string | null;
  meetingDate: Date | null;
  createdAt: Date;
  workspaceId: string | null;
  project: { id: string; name: string } | null;
  actions: MeetingActionForSummary[];
  /** Confirmed decisions logged from this meeting — never drafts, which are
   *  invisible outside the meeting's own review surfaces (ADR-0060). */
  decisions: MeetingDecisionForSummary[];
}

export interface MeetingActionForSummary {
  id: string;
  name: string;
  assignees: { user: { name: string | null } }[];
}

export interface MeetingDecisionForSummary {
  number: number;
  statement: string;
  /** `OPEN` is an open question; every other status is an answered decision. */
  status: string;
}

/** Past this, a list stops and the link to the meeting carries the rest. */
export const MAX_LISTED_ITEMS = 10;

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

export function escapeHtml(value: string): string {
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
export function inlineMarkdownToHtml(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Inline markdown → readable plain text (`**x**` → `x`, `[t](u)` → `t (u)`). */
export function stripInlineMarkdown(line: string): string {
  return line
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
}

interface ListItem {
  html: string;
  children: ListItem[];
  /** Whether this item was written with a numeric marker (`1.` / `1)`). */
  ordered: boolean;
}

/** Emit a parsed list tree as properly nested `<ul>`/`<ol>`s (first item's
 *  marker decides the tag for its level). */
function renderList(items: ListItem[]): string {
  const tag = items[0]?.ordered ? "ol" : "ul";
  const lis = items
    .map(
      (item) =>
        `<li>${item.html}${item.children.length > 0 ? renderList(item.children) : ""}</li>`,
    )
    .join("");
  return `<${tag}>${lis}</${tag}>`;
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
  // Fenced code blocks pass through verbatim (escaped) — their `#`/`- ` lines
  // are content, not structure.
  let fenceLines: string[] | null = null;

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
  const flushFence = () => {
    if (fenceLines === null) return;
    out.push(`<pre><code>${fenceLines.map(escapeHtml).join("\n")}</code></pre>`);
    fenceLines = null;
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();

    if (/^\s*```/.test(line)) {
      if (fenceLines === null) {
        flushParagraph();
        flushList();
        fenceLines = [];
      } else {
        flushFence();
      }
      continue;
    }
    if (fenceLines !== null) {
      fenceLines.push(rawLine);
      continue;
    }

    const bullet = /^([ \t]*)([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      // Tabs count as one character otherwise, collapsing real nesting.
      const indent = bullet[1]!.replace(/\t/g, "  ");
      const depth = Math.floor(indent.length / 2);
      const item: ListItem = {
        html: inlineMarkdownToHtml(escapeHtml(bullet[3]!)),
        children: [],
        ordered: /^\d/.test(bullet[2]!),
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

    if (line.trim().length === 0) {
      // A blank line must not close an open list: loosely-spaced bullets are
      // still one list, and a following bullet continues it.
      flushParagraph();
      continue;
    }

    flushList();

    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      out.push(`<p><strong>${inlineMarkdownToHtml(escapeHtml(heading[1]!))}</strong></p>`);
      continue;
    }

    paragraph.push(inlineMarkdownToHtml(escapeHtml(line)));
  }

  flushFence();
  flushList();
  flushParagraph();
  return out.join("");
}

/**
 * The same Markdown subset → plain text for the fallback `body`: heading markers
 * dropped, bullets become `•` (indentation kept), inline markup stripped.
 */
export function markdownToPlainText(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trimEnd();
      if (/^\s*```/.test(line)) {
        // Fence markers are markup; the lines between them are content.
        inFence = !inFence;
        return null;
      }
      if (inFence) return rawLine;
      const bullet = /^([ \t]*)[-*]\s+(.*)$/.exec(line);
      if (bullet)
        return `${bullet[1]!.replace(/\t/g, "  ")}• ${stripInlineMarkdown(bullet[2]!)}`;
      // Numbered markers stay as written — `1.` is already readable text.
      const numbered = /^([ \t]*)(\d+[.)])\s+(.*)$/.exec(line);
      if (numbered)
        return `${numbered[1]!.replace(/\t/g, "  ")}${numbered[2]} ${stripInlineMarkdown(numbered[3]!)}`;
      const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (heading) return stripInlineMarkdown(heading[1]!);
      return stripInlineMarkdown(line);
    })
    .filter((line): line is string => line !== null)
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

/** The meeting page opened on its Decisions tab. */
export function meetingDecisionsUrl(meeting: MeetingForSummary): string {
  return withMeetingTab(meetingUrl(meeting), "decisions").toString();
}

/**
 * Confirmed is not accepted: a confirmed decision can still be a proposal, or have been
 * superseded or deprecated since. Anything short of accepted says so, or a room would
 * read a proposal as a settled choice and act on it.
 */
function statusSuffix(status: string): string {
  return status === "ACCEPTED" ? "" : ` (${status.toLowerCase()})`;
}

interface DecisionsBlock {
  text: string[];
  html: string;
}

/** One headed, capped list of decision records — the decided ones or the open ones. */
function renderDecisionList(
  heading: string,
  records: MeetingDecisionForSummary[],
): DecisionsBlock {
  const listed = records.slice(0, MAX_LISTED_ITEMS);
  const hidden = records.length - listed.length;
  // An open question's status is its heading; only decisions carry one per line.
  const suffix = (d: MeetingDecisionForSummary) =>
    d.status === "OPEN" ? "" : statusSuffix(d.status);

  const text = [
    heading,
    ...listed.map((d) => `• ${formatDecisionLabel(d.number)} ${d.statement.trim()}${suffix(d)}`),
    ...(hidden > 0 ? [`• …and ${hidden} more`] : []),
  ];
  const items = listed
    .map((d) => {
      const status = suffix(d).trim();
      return `<li><strong>${escapeHtml(formatDecisionLabel(d.number))}</strong> ${escapeHtml(d.statement.trim())}${status ? ` <em>${escapeHtml(status)}</em>` : ""}</li>`;
    })
    .join("");
  const html = `<h5>${escapeHtml(heading)}</h5><ul>${items}${hidden > 0 ? `<li>…and ${hidden} more</li>` : ""}</ul>`;
  return { text, html };
}

/**
 * What was decided — and what was left open — leads the message, straight under the
 * title: it is the part of a meeting people who were not there most need, and the part
 * a long summary buries. The link opens the Decisions tab directly rather than the
 * Summary. Omitted entirely when there is neither — a link to an empty tab is noise.
 */
function renderDecisionsBlock(meeting: MeetingForSummary): DecisionsBlock | null {
  const decided = meeting.decisions.filter((d) => d.status !== "OPEN");
  const open = meeting.decisions.filter((d) => d.status === "OPEN");
  if (decided.length === 0 && open.length === 0) return null;

  const lists = [
    ...(decided.length > 0 ? [renderDecisionList(`⚖️ Decisions (${decided.length})`, decided)] : []),
    ...(open.length > 0 ? [renderDecisionList(`❓ Open questions (${open.length})`, open)] : []),
  ];
  const url = meetingDecisionsUrl(meeting);

  return {
    text: [...lists.flatMap((l) => [...l.text, ""]), `View decisions: ${url}`],
    html: [
      ...lists.map((l) => l.html),
      `<p><a href="${escapeHtml(url)}">View decisions in Exponential</a></p>`,
    ].join(""),
  };
}

/**
 * The action items, by name and owner, after the decisions: what was agreed, then who
 * is doing what about it. Omitted when the meeting produced none.
 */
function renderActionsBlock(meeting: MeetingForSummary): DecisionsBlock | null {
  if (meeting.actions.length === 0) return null;
  const listed = meeting.actions.slice(0, MAX_LISTED_ITEMS);
  const hidden = meeting.actions.length - listed.length;
  const heading = `✅ Action items (${meeting.actions.length})`;
  const owners = (a: MeetingActionForSummary) =>
    a.assignees
      .map((x) => x.user.name?.trim())
      .filter((name): name is string => !!name)
      .join(", ");

  const text = [
    heading,
    ...listed.map((a) => {
      const who = owners(a);
      return `• ${a.name.trim()}${who ? ` — ${who}` : ""}`;
    }),
    ...(hidden > 0 ? [`• …and ${hidden} more`] : []),
  ];
  const items = listed
    .map((a) => {
      const who = owners(a);
      return `<li>${escapeHtml(a.name.trim())}${who ? ` — <em>${escapeHtml(who)}</em>` : ""}</li>`;
    })
    .join("");
  const html = `<h5>${escapeHtml(heading)}</h5><ul>${items}${hidden > 0 ? `<li>…and ${hidden} more</li>` : ""}</ul>`;
  return { text, html };
}

function formatMeetingDate(meeting: MeetingForSummary): string {
  const date = meeting.meetingDate ?? meeting.createdAt;
  return date.toISOString().slice(0, 10);
}

export function renderMeetingSummary(meeting: MeetingForSummary): RenderedSummary {
  const title = meeting.title?.trim() ?? "Untitled meeting";
  const date = formatMeetingDate(meeting);
  const sections = meeting.summary ? extractSummarySections(meeting.summary) : [];
  const url = meetingUrl(meeting);
  const project = meeting.project?.name;
  const decisions = renderDecisionsBlock(meeting);
  const actions = renderActionsBlock(meeting);

  const textBody = sections
    .map((s) =>
      s.title
        ? `${s.title}\n${markdownToPlainText(s.content)}`
        : markdownToPlainText(s.content),
    )
    .join("\n\n");

  // No stray blank block when the meeting has no summary text at all.
  const textParts = [
    `📋 ${title}`,
    project ? `${date} · ${project}` : date,
    ...(decisions ? ["", ...decisions.text] : []),
    ...(actions ? ["", ...actions.text] : []),
    ...(textBody ? ["", textBody] : []),
    "",
    `Open in Exponential: ${url}`,
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
    decisions?.html ?? "",
    actions?.html ?? "",
    htmlBody,
    `<p><a href="${escapeHtml(url)}">Open in Exponential</a></p>`,
  ].join("");

  return { text: textParts.join("\n").trim(), html };
}
