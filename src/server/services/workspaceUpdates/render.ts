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
 * headline, a short intro, at most three highlights, at most eight one-liners,
 * then a "+N more" link, so every update reads in under two minutes.
 *
 * Only items present in the selection render, in the selection's order; the
 * writer supplies prose and plain-words titles only.
 */
export function renderUpdateMarkdown(
  written: WrittenUpdate,
  selection: UpdateSelection,
  links: RenderLinks,
): string {
  const parts: string[] = [`# ${mdEscape(written.headline)}`];
  if (written.intro.trim()) parts.push(mdEscape(written.intro));

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

  const lines = new Map(written.also.map((a) => [a.itemId, a]));
  if (selection.also.length > 0) {
    parts.push("## Also shipped");
    parts.push(
      selection.also
        .map((item) => {
          const also = lines.get(item.id);
          const title = `**${linked(also?.title?.trim() ? also.title : item.title, item.url)}**`;
          return also?.line.trim() ? `- ${title}: ${mdEscape(also.line)}` : `- ${title}`;
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

/**
 * An update's Markdown reshaped for chat (Matrix): headings become bold lines,
 * since chat clients render `#` headings huge and `###` links as banners. Lists,
 * links and paragraphs pass through. Works on whatever the Page holds, so a
 * reviewer's own edits read the same way.
 */
export function toChatMarkdown(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      // Leave fenced code exactly as written: a `# comment` there is not a heading.
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker && (fence === null || marker.startsWith(fence))) {
        fence = fence === null ? marker : null;
        return line;
      }
      if (fence !== null) return line;
      const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (!heading?.[1]) return line;
      const text = heading[1];
      return /^\*\*.*\*\*$/.test(text) ? text : `**${text}**`;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
