"use client";

import { useEffect, useRef } from "react";
import { useComputedColorScheme } from "@mantine/core";
import { renderMermaidSvg } from "~/lib/mermaid/render";

const DIAGRAM_ATTR = "data-mermaid-diagram";

/**
 * The published page body: server-rendered HTML, with each ```mermaid code
 * block drawn as a diagram once the page is in the browser (Mermaid can't run
 * on the server). The source `<pre>` is hidden only after its diagram renders,
 * so a diagram that fails to parse — or a visitor without JavaScript — still
 * sees the code. Re-renders when the visitor flips light/dark.
 */
export function PublicPageBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scheme = useComputedColorScheme("light");

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    root
      .querySelectorAll<HTMLElement>("pre > code.language-mermaid")
      .forEach((code) => {
        const pre = code.parentElement;
        if (!pre) return;
        renderMermaidSvg(code.textContent ?? "", scheme).then(
          (svg) => {
            if (cancelled) return;
            let host = pre.previousElementSibling;
            if (!host?.hasAttribute(DIAGRAM_ATTR)) {
              host = document.createElement("div");
              host.setAttribute(DIAGRAM_ATTR, "");
              host.setAttribute("role", "img");
              host.setAttribute("aria-label", "Diagram");
              host.className = "my-4 flex justify-center overflow-x-auto";
              pre.before(host);
            }
            // Mermaid output (strict security level), re-sanitised with
            // DOMPurify in renderMermaidSvg.
            host.innerHTML = svg;
            pre.hidden = true;
          },
          () => {
            // Leave the source visible.
          },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [html, scheme]);

  return (
    // Server-generated from the schema-constrained ProseMirror doc after the
    // ADR-0038 sanitization pass — the deliberate, narrow exception to the
    // no-dangerouslySetInnerHTML rule. `prd-document` is the same class the
    // in-app editor/viewer sets: Tailwind Preflight strips list markers and
    // list padding, and TypographyStylesProvider has no ul/ol rules to put
    // them back, so without it bullets and numbers vanish on the public render
    // (it also carries the table and task-list styling).
    <div
      ref={ref}
      className="prd-document"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
