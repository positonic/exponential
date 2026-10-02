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

/**
 * The deterministic writer: item titles and details, no model. Used when no
 * model is configured and as the fallback when the model call fails, so a
 * period always gets a draft for the reviewer to work from.
 */
export const templateWriter: UpdateWriter = {
  write(selection, ctx) {
    const total =
      selection.highlights.length + selection.also.length + selection.moreCount;
    const lead = selection.highlights[0];
    return Promise.resolve({
      headline: lead
        ? `${lead.title}${total > 1 ? `, and ${plural(total - 1, "more change")}` : ""}`
        : `What shipped at ${ctx.workspaceName}`,
      tldr: `${plural(total, "change")} shipped at ${ctx.workspaceName}, ${ctx.windowLabel}.`,
      highlights: selection.highlights.map((item) => ({
        itemId: item.id,
        title: item.title,
        body: item.detail ?? "",
      })),
      also: [],
      model: "template",
    });
  },
};

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
