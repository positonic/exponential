/**
 * Keep a fenced code block out of a raw HTML block.
 *
 * CommonMark runs an HTML block (a line starting with a tag, such as an
 * `<img …>` an author sized by hand) up to the next *blank* line. A fence
 * that opens on the very next line is therefore not a fence at all: its
 * lines are passed through as HTML, the parser collapses the newlines, and
 * the *closing* fence opens a code block that swallows everything up to the
 * next fence in the document. The bug surfaced on a Knowledge Page whose
 * ```mermaid diagram sat directly under a screenshot.
 *
 * This inserts the missing blank line before such a fence opener. Outside an
 * HTML block the extra blank line changes nothing (a fence always starts a
 * new block), and lines inside an open fence are never touched.
 */

const FENCE_OPENER = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * CommonMark HTML block start conditions, approximately: an open or close
 * tag, a comment, a processing instruction, a declaration or CDATA, at an
 * indent of at most three spaces. An autolink like `<https://…>` does not
 * match because `:` follows the tag name.
 */
const HTML_BLOCK_START =
  /^ {0,3}<(?:[a-zA-Z][a-zA-Z0-9-]*(?:[\s/>]|$)|\/[a-zA-Z][a-zA-Z0-9-]*\s*>|!--|\?|![a-zA-Z]|!\[CDATA\[)/;

/**
 * `<pre>`, `<script>`, `<style>` and `<textarea>` blocks end at their closing
 * tag, not at a blank line, so a fence inside one is literal content and a
 * blank line would alter it. Leave those alone.
 */
const VERBATIM_HTML_START = /^ {0,3}<(?:pre|script|style|textarea)(?:[\s/>]|$)/i;

export function separateFenceFromHtmlBlock(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let openFence: { marker: string; length: number } | null = null;
  let inHtmlBlock = false;

  for (const line of lines) {
    if (openFence) {
      out.push(line);
      const close = FENCE_OPENER.exec(line);
      if (
        close &&
        close[1]!.startsWith(openFence.marker) &&
        close[1]!.length >= openFence.length &&
        close[2]!.trim() === ""
      ) {
        openFence = null;
      }
      continue;
    }

    if (line.trim() === "") {
      inHtmlBlock = false;
      out.push(line);
      continue;
    }

    const open = FENCE_OPENER.exec(line);
    const fence = open?.[1];
    const info = open?.[2] ?? "";
    // A backtick fence whose info string holds a backtick is not an opener.
    if (fence && !(fence.startsWith("`") && info.includes("`"))) {
      if (inHtmlBlock) out.push("");
      inHtmlBlock = false;
      openFence = { marker: fence.charAt(0), length: fence.length };
      out.push(line);
      continue;
    }

    if (
      !inHtmlBlock &&
      HTML_BLOCK_START.test(line) &&
      !VERBATIM_HTML_START.test(line)
    ) {
      inHtmlBlock = true;
    }
    out.push(line);
  }

  return out.join("\n");
}
