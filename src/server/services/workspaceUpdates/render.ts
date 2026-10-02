import type { UpdateSelection, WrittenUpdate } from "./types";

/**
 * Escape record- and model-derived text before it lands in Markdown, so a
 * ticket titled `[click](https://evil)` or `**x**` renders as itself rather
 * than as a link or formatting. Leaves ordinary punctuation readable.
 */
export function mdEscape(text: string): string {
  return text.replace(/([\\`*_[\]<>#|])/g, "\\$1").replace(/\s+/g, " ").trim();
}

function linked(text: string, url: string | undefined): string {
  return url ? `[${mdEscape(text)}](${url})` : mdEscape(text);
}

export interface RenderLinks {
  /** Where "+N more" points: the full feed of what shipped. */
  moreUrl: string;
}

/**
 * The draft Page's Markdown. Structure is fixed here, not by the model:
 * headline, TL;DR, at most three highlights, at most eight one-liners, then a
 * "+N more" link — so every update reads in under two minutes.
 *
 * Only items present in the selection render, in the selection's order, with
 * the selection's own titles as link text; the writer supplies prose only.
 */
export function renderUpdateMarkdown(
  written: WrittenUpdate,
  selection: UpdateSelection,
  links: RenderLinks,
): string {
  const parts: string[] = [`# ${mdEscape(written.headline)}`];
  if (written.tldr.trim()) parts.push(`_${mdEscape(written.tldr)}_`);

  const prose = new Map(written.highlights.map((h) => [h.itemId, h]));
  if (selection.highlights.length > 0) {
    parts.push("## Highlights");
    for (const item of selection.highlights) {
      const h = prose.get(item.id);
      parts.push(`### ${linked(h?.title ?? item.title, item.url)}`);
      const body = h?.body ?? item.detail;
      if (body?.trim()) parts.push(mdEscape(body));
    }
  }

  const lines = new Map(written.also.map((a) => [a.itemId, a.line]));
  if (selection.also.length > 0) {
    parts.push("## Also shipped");
    parts.push(
      selection.also
        .map((item) => {
          const line = lines.get(item.id);
          return line
            ? `- ${linked(item.title, item.url)}: ${mdEscape(line)}`
            : `- ${linked(item.title, item.url)}`;
        })
        .join("\n"),
    );
  }

  if (selection.moreCount > 0) {
    parts.push(
      `[+${selection.moreCount} more change${selection.moreCount === 1 ? "" : "s"} →](${links.moreUrl})`,
    );
  }

  return parts.join("\n\n");
}
