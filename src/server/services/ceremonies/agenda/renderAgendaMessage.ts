/**
 * The agenda as a Matrix message (ADR-0059), built straight from the
 * structured sections rather than from the LLM narrative. The narrative is
 * told to copy every item verbatim, so in a chat room it adds no information
 * — it only flattens each item into one " · "-joined run-on line, drops the
 * ⚠️ attention flags (its prompt forbids emoji) and opens with a sentence of
 * filler. The narrative stays the pre-read on the occurrence page.
 *
 * Layout, top to bottom: the title and the date; each section with items
 * under a heading with its icon; a project-like item (one with an owner or
 * extra lines) as a short card of its own, everything else as a bullet; the
 * empty sections folded into a single line at the end, so "Nothing to
 * raise." never pushes the content below the fold; the link.
 *
 * Spacing is line breaks, not paragraphs: Element X sets paragraphs flush
 * against each other, so everything after the title is one paragraph with a
 * blank line (`<br/><br/>`) between sections and between cards.
 *
 * Record-derived text (Action names, project names, Decision statements) is
 * HTML-escaped and never parsed as Markdown, so a record titled
 * `[Approve](https://evil.example)` cannot make the bot post a live link.
 * Only links the code itself builds are live — and a hand-added item's,
 * which a workspace member wrote for this agenda as Markdown (ADR-0017).
 */
import { escapeHtml, inlineMarkdownToHtml, stripInlineMarkdown } from "~/server/services/matrix/renderMeetingSummary";
import { colorTokens } from "~/styles/colors";
import type { AgendaItem, AgendaItemLine, AgendaSection, AgendaSnapshot } from "./types";

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

/**
 * Red for a date that has passed, as Matrix's own colour attribute
 * (`data-mx-color`) plus `color` for older clients. The dark theme's error
 * red: chat clients mostly run dark, and it still reads on a light one.
 */
const WARN_COLOR = colorTokens.dark.brand.error;

const BREAK = "<br/>";
const BLANK = "<br/><br/>";

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

const anchor = (href: string | null, inner: string) => (href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner);

/** The item's title as HTML: Markdown for a person's own item, escaped text for a record's. */
function titleHtml(item: AgendaItem, baseUrl: string): string {
  const title = item.addedByUserId ? inlineMarkdownToHtml(escapeHtml(item.title.trim())) : escapeHtml(item.title.trim());
  const linked = item.addedByUserId ? title : anchor(absoluteHref(baseUrl, item.href), title);
  return item.resolvedAt ? `<del>${linked}</del>` : linked;
}

function titleText(item: AgendaItem): string {
  return item.addedByUserId ? stripInlineMarkdown(item.title.trim()) : item.title.trim();
}

const carriedNote = (item: AgendaItem) => (item.carriedFromOccurrenceId ? "↩️ carried over" : null);

/** The card's lines; a snapshot from before lines carried spans has plain strings. */
function cardLines(item: AgendaItem): AgendaItemLine[] {
  const lines = item.lines ?? (item.detail ? [item.detail] : []);
  const out = lines.map((line) => (typeof line === "string" ? [{ text: line }] : line));
  const note = carriedNote(item);
  if (note) out.push([{ text: note }]);
  return out;
}

function lineHtml(line: AgendaItemLine, baseUrl: string): string {
  return line
    .map((span) => {
      const text = escapeHtml(span.warn ? `⚠️ ${span.text}` : span.text);
      const linked = anchor(absoluteHref(baseUrl, span.href), text);
      return span.warn ? `<font color="${WARN_COLOR}" data-mx-color="${WARN_COLOR}">${linked}</font>` : linked;
    })
    .join("");
}

const lineText = (line: AgendaItemLine) => line.map((span) => (span.warn ? `⚠️ ${span.text}` : span.text)).join("");

function cardHtml(item: AgendaItem, baseUrl: string): string {
  const head = `<strong>${titleHtml(item, baseUrl)}</strong>${item.owner ? ` — ${escapeHtml(item.owner)}` : ""}`;
  const lines = cardLines(item).map((line) => lineHtml(line, baseUrl));
  // The last line is the counts and dates; muted so the next step reads first.
  const body = lines.map((l, i) => (i === lines.length - 1 && lines.length > 1 ? `<em>${l}</em>` : l));
  return [head, ...body].join(BREAK);
}

function cardText(item: AgendaItem): string {
  const head = `${titleText(item)}${item.owner ? ` — ${item.owner}` : ""}`;
  return [head, ...cardLines(item).map((line) => `   ${lineText(line)}`)].join("\n");
}

function bulletHtml(item: AgendaItem, baseUrl: string): string {
  const extras = [item.detail ? escapeHtml(item.detail) : null, carriedNote(item)].filter(Boolean).join(" · ");
  return `• ${titleHtml(item, baseUrl)}${extras ? ` <em>— ${extras}</em>` : ""}`;
}

function bulletText(item: AgendaItem): string {
  const title = item.resolvedAt ? `${titleText(item)} (done)` : titleText(item);
  const extras = [item.detail, carriedNote(item)].filter(Boolean).join(" · ");
  return `• ${title}${extras ? ` — ${extras}` : ""}`;
}

/**
 * A section's items, in order: each card a block of its own with a blank
 * line around it; consecutive bullets one block, a line each.
 */
function sectionBlocks<T>(items: AgendaItem[], card: (i: AgendaItem) => T, bullet: (i: AgendaItem) => T): Array<T | T[]> {
  const out: Array<T | T[]> = [];
  let bullets: T[] = [];
  const flush = () => {
    if (bullets.length) out.push(bullets);
    bullets = [];
  };
  for (const item of items) {
    if (isCard(item)) {
      flush();
      out.push(card(item));
    } else {
      bullets.push(bullet(item));
    }
  }
  flush();
  return out;
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
  const dateLine = `Agenda for ${input.when}`;
  const emptyLine =
    filled.length === 0
      ? "💤 Nothing on the agenda yet."
      : empty.length > 0
        ? `💤 Nothing raised yet for ${listInWords(empty.map((s) => s.title))}.`
        : null;
  const link = /^https?:\/\//.test(input.url);

  const htmlBlocks: string[] = [escapeHtml(dateLine)];
  const textBlocks: string[] = [dateLine];
  for (const section of filled) {
    const heading = sectionHeading(section);
    htmlBlocks.push(`<strong>${escapeHtml(heading)}</strong>`);
    textBlocks.push(heading);
    for (const block of sectionBlocks(section.items, (i) => cardHtml(i, baseUrl), (i) => bulletHtml(i, baseUrl))) {
      htmlBlocks.push(Array.isArray(block) ? block.join(BREAK) : block);
    }
    for (const block of sectionBlocks(section.items, cardText, bulletText)) {
      textBlocks.push(Array.isArray(block) ? block.join("\n") : block);
    }
  }
  if (emptyLine) {
    htmlBlocks.push(`<em>${escapeHtml(emptyLine)}</em>`);
    textBlocks.push(emptyLine);
  }
  htmlBlocks.push(link ? `🔗 <a href="${escapeHtml(input.url)}">Open the agenda in Exponential</a>` : `🔗 ${escapeHtml(input.url)}`);
  textBlocks.push(`🔗 Open the agenda: ${input.url}`);

  return {
    html: `<h4>${escapeHtml(title)}</h4><p>${htmlBlocks.join(BLANK)}</p>`,
    text: [title, ...textBlocks].join("\n\n"),
  };
}
