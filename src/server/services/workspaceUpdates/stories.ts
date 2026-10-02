import type { ShippedItem, ShippedPart } from "./types";

/** At most this many pieces of work are listed under one story. */
export const MAX_PARTS = 8;
/** Each extra piece of work adds this much weight, up to MAX_BREADTH_BONUS. */
const BREADTH_BONUS = 5;
const MAX_BREADTH_BONUS = 20;
const DETAIL_CHARS = 300;

/**
 * Drop internal release labels from a title: "V2: Publish on approval" →
 * "Publish on approval", "Docs v3 – Open Graph images" → "Open Graph images".
 * Readers don't know what V2 or "Docs v3" mean; the story's feature name
 * already says what it belongs to. A title that is only a label stays as is.
 */
export function cleanWorkTitle(title: string): string {
  const cleaned = title
    .replace(/^\s*(?:[\p{L}\p{N}&'’ .-]{0,30}?\s)?v\d+(?:\.\d+)*\s*[:–—-]\s*/iu, "")
    .trim();
  return cleaned.length > 0 ? cleaned : title.trim();
}

/** Markdown to one line of plain text: no syntax, links reduced to their text. */
function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+\[[ xX]\]\s*/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[`*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * A short plain-text summary of a ticket or feature body for the writer. When
 * the body has a "What to build" (or "Summary", "Problem", "Why") section, that
 * section is used; otherwise the first paragraph that isn't a heading.
 */
export function summarizeBody(markdown: string | null | undefined, max = DETAIL_CHARS): string | undefined {
  if (!markdown?.trim()) return undefined;
  const sections = markdown.split(/^#{1,6}\s+/m);
  const preferred = sections.find((section) => /^(what to build|summary|overview|problem|why)\b/i.test(section));
  let source: string | undefined;
  if (preferred) {
    source = preferred.replace(/^[^\n]*\n/, "");
  } else {
    source = markdown
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p.length > 0 && !p.startsWith("#"));
  }
  const text = source ? plainText(source) : "";
  return text ? truncate(text, max) : undefined;
}

function partOf(item: ShippedItem): ShippedPart {
  return { title: cleanWorkTitle(item.title), ...(item.detail ? { detail: item.detail } : {}) };
}

/**
 * Turn gathered items into stories, one per feature: a feature going Live, its
 * shipped milestones and its finished tickets become one story told under the
 * feature's name, instead of several disconnected one-liners. Items with no
 * feature stay stories of their own.
 *
 * A story's weight is its most newsworthy piece plus a little for each further
 * piece (capped), so a feature that moved a lot outranks a lone ticket of the
 * same kind. It shipped when its latest piece did.
 */
export function groupIntoStories(items: ShippedItem[]): ShippedItem[] {
  const byFeature = new Map<string, ShippedItem[]>();
  const standalone: ShippedItem[] = [];
  for (const item of items) {
    if (item.weight <= 0) continue;
    if (item.feature) {
      const group = byFeature.get(item.feature.id) ?? [];
      group.push(item);
      byFeature.set(item.feature.id, group);
    } else {
      standalone.push(item);
    }
  }

  // Without a feature name to stand in for it, a stand-alone title keeps its label.
  const stories: ShippedItem[] = [...standalone];
  for (const group of byFeature.values()) {
    const feature = group[0]!.feature!;
    const ordered = [...group].sort((a, b) => b.weight - a.weight || b.at.localeCompare(a.at));
    const lead = ordered[0]!;
    // The feature's own "went Live" item is the story itself, not a part of it.
    const pieces = ordered.filter((item) => item.source !== "feature");
    const weight = lead.weight + Math.min(MAX_BREADTH_BONUS, BREADTH_BONUS * (group.length - 1));
    stories.push({
      id: `story:${feature.id}`,
      source: lead.source,
      title: feature.name,
      ...(feature.description ? { detail: feature.description } : {}),
      url: feature.url ?? lead.url,
      weight,
      at: ordered.reduce((latest, item) => (item.at > latest ? item.at : latest), lead.at),
      feature,
      parts: pieces.slice(0, MAX_PARTS).map(partOf),
    });
  }
  return stories;
}
