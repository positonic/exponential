import DOMPurify from "dompurify";
import type { Mermaid } from "mermaid";
import { reportHandledError } from "~/lib/reportHandledError";

/**
 * Browser-only Mermaid rendering shared by every surface that shows a
 * ```mermaid fenced block: the Markdown renderer, the Page/Feature editor's
 * code-block node view and the published-page body.
 *
 * Mermaid is ~1 MB of JavaScript, so it is imported on first use rather than
 * shipped with every page that can render Markdown.
 */

export type MermaidTheme = "light" | "dark";

let mermaidPromise: Promise<Mermaid> | null = null;

function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then(
    (m) => m.default,
    (error: unknown) => {
      // A failed chunk load (stale deploy, flaky network) shouldn't stick for
      // the whole session: the next diagram gets a fresh attempt.
      mermaidPromise = null;
      reportHandledError(error, { area: "mermaid.load" });
      throw error;
    },
  );
  return mermaidPromise;
}

// `initialize` is global, so a render must not interleave with another
// render's `initialize` — run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
let renderCount = 0;

/**
 * Render Mermaid `source` to an SVG string. Rejects with Mermaid's parse error
 * for invalid source, so callers can fall back to showing the code.
 */
export function renderMermaidSvg(
  source: string,
  theme: MermaidTheme,
): Promise<string> {
  const run = async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      // Strict: labels are sanitised and click handlers / scripts disabled —
      // the source is user-authored.
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
      // Don't let a parse error inject Mermaid's own error graphic into the
      // document body; the caller shows the error instead.
      suppressErrorRendering: true,
      // Keys a diagram's own `%%{init}%%` directive or frontmatter config may
      // not override. Mermaid's defaults, plus every styling key: `themeCSS`
      // and the font keys reach the SVG's <style> with only a brace-balance
      // check, which DOMPurify doesn't sanitise either — so an author could
      // restyle a published page. Locking the theme keys also keeps diagrams
      // following the app's light/dark scheme.
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "suppressErrorRendering",
        "maxEdges",
        "theme",
        "themeCSS",
        "themeVariables",
        "darkMode",
        "fontFamily",
        "altFontFamily",
      ],
    });
    renderCount += 1;
    const { svg } = await mermaid.render(`mermaid-diagram-${renderCount}`, source);
    // Defence in depth on top of strict mode before the SVG goes into the DOM.
    // Flowchart labels are HTML inside <foreignObject>, so keep that.
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      ADD_TAGS: ["foreignObject"],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
    });
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Mermaid's error text (a parse error points at the offending line). */
export function mermaidErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || "Invalid diagram";
}
