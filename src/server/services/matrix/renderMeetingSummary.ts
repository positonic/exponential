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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The summary fields worth posting, best first. Only the first one present is used:
 * the meeting's outputs are the message, and the summary is context under them — a
 * room that got every field (outline, bullets, gist, breakdown…) saw a wall of text
 * with the outputs lost in it. `action_items` is deliberately absent: it is the
 * summarizer's own unreviewed list, and the message already carries the real one.
 */
const SUMMARY_PROSE_KEYS = [
  "overview",
  "short_summary",
  "short_overview",
  "gist",
  "detailed_breakdown",
  "outline",
  "bullet_gist",
  "shorthand_bullet",
] as const;

/**
 * The one piece of prose to post under the outputs, from whatever shape the summary
 * is in. Fireflies-derived summaries are objects with named fields; older and
 * hand-written ones are plain strings. Both reach this function. Null when an object
 * holds none of the known prose fields — dumping its raw JSON into a room helps nobody,
 * and the link carries the reader to the full meeting.
 */
export function pickSummaryProse(rawSummary: string): string | null {
  const trimmed = rawSummary.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON at all — it is already the prose we want.
    return trimmed || null;
  }

  if (typeof parsed === "string") return parsed.trim() || null;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return trimmed || null;
  }

  const record = parsed as Record<string, unknown>;
  for (const key of SUMMARY_PROSE_KEYS) {
    const rendered = renderSection(record[key]);
    if (rendered) return rendered;
  }
  return null;
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
 * plus `<h5>` output and `<h6>` summary labels, and a summary's inner headings must
 * sit below all of them.
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

/** The meeting page opened on its Outputs tab, where actions, decisions and open
 *  questions are listed side by side. */
export function meetingOutputsUrl(meeting: MeetingForSummary): string {
  return withMeetingTab(meetingUrl(meeting), "outputs").toString();
}

/**
 * Confirmed is not accepted: a confirmed decision can still be a proposal, or have been
 * superseded or deprecated since. Anything short of accepted says so, or a room would
 * read a proposal as a settled choice and act on it.
 */
function statusSuffix(status: string): string {
  return status === "ACCEPTED" ? "" : ` (${status.toLowerCase()})`;
}

interface OutputBlock {
  text: string[];
  html: string;
}

/** One output list's line, in both formats. */
interface OutputLine {
  text: string;
  html: string;
}

/** A headed, capped list — every output type is shaped the same, so none looks lesser. */
function renderOutputList(heading: string, lines: OutputLine[]): OutputBlock {
  const listed = lines.slice(0, MAX_LISTED_ITEMS);
  const hidden = lines.length - listed.length;
  const more = hidden > 0 ? `…and ${hidden} more` : null;
  return {
    text: [heading, ...listed.map((l) => `• ${l.text}`), ...(more ? [`• ${more}`] : [])],
    html: `<h5>${escapeHtml(heading)}</h5><ul>${listed.map((l) => `<li>${l.html}</li>`).join("")}${more ? `<li>${more}</li>` : ""}</ul>`,
  };
}

function actionLine(action: MeetingActionForSummary): OutputLine {
  const who = action.assignees
    .map((x) => x.user.name?.trim())
    .filter((name): name is string => !!name)
    .join(", ");
  const name = action.name.trim();
  return {
    text: `${name}${who ? ` — ${who}` : ""}`,
    html: `${escapeHtml(name)}${who ? ` — <em>${escapeHtml(who)}</em>` : ""}`,
  };
}

function decisionLine(decision: MeetingDecisionForSummary): OutputLine {
  const label = formatDecisionLabel(decision.number);
  const statement = decision.statement.trim();
  // An open question's status is its heading; only decisions carry one per line.
  const status = decision.status === "OPEN" ? "" : statusSuffix(decision.status).trim();
  return {
    text: `${label} ${statement}${status ? ` ${status}` : ""}`,
    html: `<strong>${escapeHtml(label)}</strong> ${escapeHtml(statement)}${status ? ` <em>${escapeHtml(status)}</em>` : ""}`,
  };
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

interface MeetingOutputs {
  actions: MeetingActionForSummary[];
  decided: MeetingDecisionForSummary[];
  open: MeetingDecisionForSummary[];
}

function splitOutputs(meeting: MeetingForSummary): MeetingOutputs {
  return {
    actions: meeting.actions,
    decided: meeting.decisions.filter((d) => d.status !== "OPEN"),
    open: meeting.decisions.filter((d) => d.status === "OPEN"),
  };
}

/**
 * One line naming all three output types, zeros included. It is the line a reader
 * skimming the room actually reads, and "0 open questions" is information — a list
 * that is simply absent cannot say whether nothing was left open or nobody looked.
 */
function renderOutputsTally(outputs: MeetingOutputs): string {
  return [
    plural(outputs.actions.length, "action"),
    plural(outputs.decided.length, "decision"),
    plural(outputs.open.length, "open question"),
  ].join(" · ");
}

/**
 * The meeting's outputs lead the message, straight under the title — they are what
 * people who were not there most need, and what a summary buries. Same order as the
 * Outputs tab's columns: who is doing what, what was agreed, what is still open. Each
 * list is omitted when empty (the tally already says so), and the whole block, link
 * included, when there is nothing at all — a link to an empty tab is noise.
 */
function renderOutputsBlock(meeting: MeetingForSummary, outputs: MeetingOutputs): OutputBlock | null {
  const lists = [
    ...(outputs.actions.length > 0
      ? [renderOutputList(`✅ Actions (${outputs.actions.length})`, outputs.actions.map(actionLine))]
      : []),
    ...(outputs.decided.length > 0
      ? [renderOutputList(`⚖️ Decisions (${outputs.decided.length})`, outputs.decided.map(decisionLine))]
      : []),
    ...(outputs.open.length > 0
      ? [renderOutputList(`❓ Open questions (${outputs.open.length})`, outputs.open.map(decisionLine))]
      : []),
  ];
  if (lists.length === 0) return null;

  const url = meetingOutputsUrl(meeting);
  return {
    // The URL stands alone on its line so clients linkify it cleanly and it is easy to tap.
    text: [...lists.flatMap((l) => [...l.text, ""]), "Review all outputs in Exponential:", url],
    html: [
      ...lists.map((l) => l.html),
      `<p><a href="${escapeHtml(url)}">Review all outputs in Exponential</a></p>`,
    ].join(""),
  };
}

function formatMeetingDate(meeting: MeetingForSummary): string {
  const date = meeting.meetingDate ?? meeting.createdAt;
  return date.toISOString().slice(0, 10);
}

/** Separates the outputs from the summary in the text body, where there is no `<hr>`. */
const TEXT_RULE = "──────────";

export function renderMeetingSummary(meeting: MeetingForSummary): RenderedSummary {
  const title = meeting.title?.trim() ?? "Untitled meeting";
  const date = formatMeetingDate(meeting);
  const prose = meeting.summary ? pickSummaryProse(meeting.summary) : null;
  const url = meetingUrl(meeting);
  const project = meeting.project?.name;
  const outputs = splitOutputs(meeting);
  const tally = renderOutputsTally(outputs);
  const outputsBlock = renderOutputsBlock(meeting, outputs);
  const subtitle = project ? `${date} · ${project}` : date;

  // No stray blank block when the meeting has no summary text at all.
  const textParts = [
    `📋 ${title}`,
    subtitle,
    tally,
    ...(outputsBlock ? ["", ...outputsBlock.text] : []),
    ...(prose ? ["", TEXT_RULE, "Summary", markdownToPlainText(prose)] : []),
    "",
    `Open in Exponential: ${url}`,
  ];

  // The summary's label sits a level below the output headings: it is context for
  // them, not a peer.
  const html = [
    `<h4>📋 ${escapeHtml(title)}</h4>`,
    `<p><em>${escapeHtml(subtitle)}</em><br/><strong>${escapeHtml(tally)}</strong></p>`,
    outputsBlock?.html ?? "",
    prose ? `<hr/><h6>Summary</h6>${markdownToMatrixHtml(prose)}` : "",
    `<p><a href="${escapeHtml(url)}">Open in Exponential</a></p>`,
  ].join("");

  return { text: textParts.join("\n").trim(), html };
}
