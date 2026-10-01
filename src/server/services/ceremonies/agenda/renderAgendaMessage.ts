/**
 * The agenda as a Matrix message (ADR-0059), built straight from the
 * structured sections rather than from the LLM narrative. The narrative is
 * told to copy every item verbatim, so in a chat room it adds no information
 * — it only flattens each item into one " · "-joined run-on line, drops the
 * ⚠️ attention flags (its prompt forbids emoji) and opens with a sentence of
 * filler. The narrative stays the pre-read on the occurrence page.
 *
 * Layout, top to bottom: a title and one line of what the meeting holds;
 * each section with items under a heading with its icon; a project-like item
 * (one with an owner or extra lines) as a short card of its own, everything
 * else as a bullet; the empty sections folded into a single line at the end,
 * so "Nothing to raise." never pushes the content below the fold; the link.
 *
 * Record-derived text (Action names, project names, Decision statements) is
 * HTML-escaped and never parsed as Markdown, so a record titled
 * `[Approve](https://evil.example)` cannot make the bot post a live link.
 * Only text the code itself authors carries links — and a hand-added item,
 * which a workspace member wrote for this agenda as Markdown (ADR-0017).
 */
import { escapeHtml, inlineMarkdownToHtml, stripInlineMarkdown } from "~/server/services/matrix/renderMeetingSummary";
import type { AgendaItem, AgendaSection, AgendaSnapshot } from "./types";

export interface RenderedAgenda {
  html: string;
  text: string;
}

/** One icon per section kind; a kind without one gets a plain heading. */
const SECTION_ICON: Record<string, string> = {
  linked_projects: "📁",
  project_state: "📁",
  dri_projects: "📁",
  decisions_pending: "⚖️",
  blockers: "🚧",
  free_text: "💬",
  cycle_progress: "🔄",
  okr_review: "🎯",
  carried_over: "↩️",
  retro_actions: "🔁",
  todays_actions: "📌",
  todays_meetings: "📅",
  up_next: "⏭️",
  tomorrow: "🌅",
  yesterday: "⏪",
  completed_today: "✅",
  activity_today: "📈",
  time_today: "⏱️",
};

function sectionHeading(section: AgendaSection): string {
  const icon = SECTION_ICON[section.type];
  const minutes = section.minutes ? ` · ${section.minutes} min` : "";
  return `${icon ? `${icon} ` : ""}${section.title}${minutes}`;
}

/** "a, b and c". */
function listInWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const isCard = (item: AgendaItem) => Boolean(item.owner) || (item.lines?.length ?? 0) > 0;

function absoluteHref(baseUrl: string, href: string | null | undefined): string | null {
  if (!href || !/^https?:\/\//.test(baseUrl)) return null;
  return `${baseUrl.replace(/\/+$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

/** The item's title as HTML: Markdown for a person's own item, escaped text for a record's. */
function titleHtml(item: AgendaItem, baseUrl: string): string {
  const title = item.addedByUserId ? inlineMarkdownToHtml(escapeHtml(item.title.trim())) : escapeHtml(item.title.trim());
  const link = item.addedByUserId ? null : absoluteHref(baseUrl, item.href);
  const linked = link ? `<a href="${escapeHtml(link)}">${title}</a>` : title;
  return item.resolvedAt ? `<del>${linked}</del>` : linked;
}

function titleText(item: AgendaItem): string {
  return item.addedByUserId ? stripInlineMarkdown(item.title.trim()) : item.title.trim();
}

const carriedNote = (item: AgendaItem) => (item.carriedFromOccurrenceId ? "↩️ carried over" : null);

function cardHtml(item: AgendaItem, baseUrl: string): string {
  const head = `<strong>${titleHtml(item, baseUrl)}</strong>${item.owner ? ` — ${escapeHtml(item.owner)}` : ""}`;
  const lines = (item.lines ?? (item.detail ? [item.detail] : [])).map((l) => escapeHtml(l));
  const note = carriedNote(item);
  if (note) lines.push(note);
  // The last line is the numbers; muted so the next step reads first.
  const body = lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? `<em>${l}</em>` : l));
  return `<p>${[head, ...body].join("<br/>")}</p>`;
}

function cardText(item: AgendaItem): string {
  const head = `${titleText(item)}${item.owner ? ` — ${item.owner}` : ""}`;
  const lines = item.lines ?? (item.detail ? [item.detail] : []);
  const note = carriedNote(item);
  return [head, ...lines, ...(note ? [note] : [])].map((l, i) => (i === 0 ? l : `   ${l}`)).join("\n");
}

function bulletHtml(item: AgendaItem, baseUrl: string): string {
  const extras = [item.detail ? escapeHtml(item.detail) : null, carriedNote(item)].filter(Boolean).join(" · ");
  return `<li>${titleHtml(item, baseUrl)}${extras ? ` <em>— ${extras}</em>` : ""}</li>`;
}

function bulletText(item: AgendaItem): string {
  const title = item.resolvedAt ? `${titleText(item)} (done)` : titleText(item);
  const extras = [item.detail, carriedNote(item)].filter(Boolean).join(" · ");
  return `• ${title}${extras ? ` — ${extras}` : ""}`;
}

/** The section's items: cards for project-like items, one list for the rest, in item order. */
function sectionBodyHtml(items: AgendaItem[], baseUrl: string): string {
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(`<ul>${bullets.join("")}</ul>`);
    bullets = [];
  };
  for (const item of items) {
    if (isCard(item)) {
      flush();
      out.push(cardHtml(item, baseUrl));
    } else {
      bullets.push(bulletHtml(item, baseUrl));
    }
  }
  flush();
  return out.join("");
}

function summaryLine(when: string, sections: AgendaSection[]): string {
  const items = sections.flatMap((s) => s.items).filter((i) => !i.resolvedAt);
  const attention = items.filter((i) => i.needsAttention).length;
  const parts = [`Agenda for ${when}`];
  if (items.length > 0) parts.push(`${items.length} item${items.length === 1 ? "" : "s"}`);
  if (attention > 0) parts.push(`⚠️ ${attention} need${attention === 1 ? "s" : ""} attention`);
  return parts.join(" · ");
}

export function renderAgendaMessage(input: {
  ceremonyName: string;
  when: string;
  agenda: AgendaSnapshot;
  /** Deep link to the occurrence page. */
  url: string;
  /** Origin that app-relative item links hang off; items stay unlinked without one. */
  baseUrl?: string;
}): RenderedAgenda {
  const baseUrl = input.baseUrl ?? "";
  const filled = input.agenda.sections.filter((s) => s.items.length > 0);
  const empty = input.agenda.sections.filter((s) => s.items.length === 0);
  const title = `🗓️ ${input.ceremonyName}`;
  const summary = summaryLine(input.when, input.agenda.sections);
  const emptyLine =
    filled.length === 0
      ? "💤 Nothing on the agenda yet."
      : empty.length > 0
        ? `💤 Nothing raised yet for ${listInWords(empty.map((s) => s.title))}.`
        : null;
  const link = /^https?:\/\//.test(input.url);

  const html: string[] = [`<h4>${escapeHtml(title)}</h4>`, `<p>${escapeHtml(summary)}</p>`];
  const text: string[] = [title, summary];
  for (const section of filled) {
    const heading = sectionHeading(section);
    html.push(`<h5>${escapeHtml(heading)}</h5>`, sectionBodyHtml(section.items, baseUrl));
    text.push("", heading, ...section.items.map((item) => (isCard(item) ? cardText(item) : bulletText(item))));
  }
  if (emptyLine) {
    html.push(`<p><em>${escapeHtml(emptyLine)}</em></p>`);
    text.push("", emptyLine);
  }
  html.push(link ? `<p>🔗 <a href="${escapeHtml(input.url)}">Open the agenda in Exponential</a></p>` : `<p>🔗 ${escapeHtml(input.url)}</p>`);
  text.push("", `🔗 Open the agenda: ${input.url}`);

  return { html: html.join(""), text: text.join("\n") };
}
