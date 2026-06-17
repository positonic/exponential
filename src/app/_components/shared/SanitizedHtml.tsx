"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";

// Force target=_blank links to carry rel=noopener (anti tab-nabbing). Registered
// once at module load — this module is client-only, so DOMPurify has a real DOM.
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLElement && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

interface SanitizedHtmlProps {
  html: string;
  className?: string;
  allowedTags: string[];
  allowedAttr: string[];
}

/** Strip tags for a safe SSR / pre-hydration text fallback (no DOM needed). */
function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Renders tolerated legacy HTML, sanitised with DOMPurify. Client-only on
 * purpose: `dompurify` needs a DOM, so running it during SSR would throw (its
 * `sanitize` is not even a function without a `window`). To stay SSR-safe and
 * avoid a hydration mismatch, the server and the first client render both show
 * an escaped-text fallback; the sanitised HTML is swapped in after mount.
 */
export function SanitizedHtml({
  html,
  className,
  allowedTags,
  allowedAttr,
}: SanitizedHtmlProps) {
  const [clean, setClean] = useState<string | null>(null);

  useEffect(() => {
    setClean(
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: allowedAttr,
        ALLOW_DATA_ATTR: false,
      }),
    );
  }, [html, allowedTags, allowedAttr]);

  if (clean === null) {
    return <div className={className}>{toPlainText(html)}</div>;
  }

  return (
    <div
      className={className}
      // `clean` is DOMPurify output produced in the browser above.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
