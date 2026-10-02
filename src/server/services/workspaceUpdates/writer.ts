import { MAX_ALSO, MAX_HIGHLIGHTS } from "./select";
import type { ShippedItem, UpdateSelection, WrittenUpdate } from "./types";

export interface WriteContext {
  workspaceName: string;
  /** Human label for the window, e.g. "25 Sep – 2 Oct". */
  windowLabel: string;
  /** The voice to write in (an Assistant's personality). */
  personality?: string | null;
  /** A reviewer's "regenerate with feedback" note. */
  feedback?: string | null;
}

/** Turns a selection into prose. Injectable so tests and the no-key path need no network. */
export interface UpdateWriter {
  write(selection: UpdateSelection, ctx: WriteContext): Promise<WrittenUpdate>;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** What shipped for a story, from its own words: the feature's description, then its pieces. */
function storyBody(item: ShippedItem): string {
  const pieces = (item.parts ?? []).map((part) => part.title);
  const parts = [
    item.detail ? sentence(item.detail) : "",
    pieces.length > 0 ? sentence(`What shipped: ${listJoin(pieces)}`) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function storyLine(item: ShippedItem): string {
  const pieces = (item.parts ?? []).map((part) => part.title);
  if (pieces.length > 1) return listJoin(pieces);
  return pieces[0] !== item.title ? (pieces[0] ?? item.detail ?? "") : (item.detail ?? "");
}

/**
 * The deterministic writer: the stories' own titles and descriptions, no
 * model. Used when no model is configured and as the fallback when the model
 * call fails, so a period always gets a draft for the reviewer to work from.
 * `reason` says why it stood in, and shows on the draft.
 */
export function createTemplateWriter(reason?: string): UpdateWriter {
  return {
    write(selection, ctx) {
      const stories = selectionItems(selection);
      const lead = selection.highlights[0];
      const smaller = selection.also.length + selection.moreCount;
      const titles = selection.highlights.map((item) => item.title);
      return Promise.resolve({
        headline: lead ? lead.title : `What shipped at ${ctx.workspaceName}`,
        intro:
          stories.length === 0
            ? `Nothing new shipped at ${ctx.workspaceName}, ${ctx.windowLabel}.`
            : sentence(
                `New at ${ctx.workspaceName}, ${ctx.windowLabel}: ${listJoin(titles)}` +
                  (smaller > 0 ? `, plus ${plural(smaller, "smaller change")}` : ""),
              ),
        highlights: selection.highlights.map((item) => ({
          itemId: item.id,
          title: item.title,
          body: storyBody(item),
        })),
        also: selection.also
          .map((item) => ({ itemId: item.id, title: item.title, line: storyLine(item) }))
          .filter((a) => a.line),
        model: reason ? `template (${reason})` : "template",
      });
    },
  };
}

export const templateWriter: UpdateWriter = createTemplateWriter();

/**
 * Hold a writer's output to the selection: drop anything citing an item the
 * selection does not contain (a model must never mention unshipped work),
 * keep each item at most once, and re-apply the caps.
 */
export function constrainToSelection(
  written: WrittenUpdate,
  selection: UpdateSelection,
): WrittenUpdate {
  const highlightIds = new Set(selection.highlights.map((i) => i.id));
  const alsoIds = new Set(selection.also.map((i) => i.id));
  const seen = new Set<string>();
  const once = (id: string) => (seen.has(id) ? false : (seen.add(id), true));

  return {
    ...written,
    highlights: written.highlights
      .filter((h) => highlightIds.has(h.itemId) && once(h.itemId))
      .slice(0, MAX_HIGHLIGHTS),
    also: written.also
      .filter((a) => alsoIds.has(a.itemId) && once(a.itemId))
      .slice(0, MAX_ALSO),
  };
}

/** Every item the writer was allowed to see, in selection order. */
export function selectionItems(selection: UpdateSelection): ShippedItem[] {
  return [...selection.highlights, ...selection.also];
}
