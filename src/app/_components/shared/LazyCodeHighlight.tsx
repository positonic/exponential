"use client";

import { lazy, Suspense } from "react";
import type { CodeHighlight as CodeHighlightComponent } from "@mantine/code-highlight";

// @mantine/code-highlight bundles all of highlight.js (~300 KB transferred).
// Imported statically from MarkdownRenderer it shipped with every page that
// can render Markdown — including Zoe's chat, which every page loads —
// whether or not any code block was on screen. It now loads on its own: when
// the page goes idle, or when a code block renders first.

type CodeHighlightModule = { default: typeof CodeHighlightComponent };

let loaded: CodeHighlightModule | null = null;
let loading: Promise<CodeHighlightModule> | null = null;

function loadCodeHighlight(): Promise<CodeHighlightModule> {
  loading ??= import("@mantine/code-highlight").then((m) => {
    loaded = { default: m.CodeHighlight };
    return loaded;
  });
  return loading;
}

const CodeHighlight = lazy(() => {
  if (loaded) {
    // React subscribes to this synchronously, so an already-loaded module
    // renders straight away instead of suspending for a tick behind the
    // plain-text fallback.
    const mod = loaded;
    const settled = {
      then: (resolve: (value: CodeHighlightModule) => void) => resolve(mod),
    };
    return settled as unknown as Promise<CodeHighlightModule>;
  }
  return loadCodeHighlight();
});

if (typeof window === "undefined") {
  // Server: load up front so server-rendered pages inline the highlighted
  // markup rather than streaming the fallback first.
  void loadCodeHighlight();
} else {
  // Browser: load once the page is idle, so a code block that renders later
  // (a client navigation, a chat reply) is highlighted immediately.
  const preload = () => void loadCodeHighlight();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(preload);
  } else {
    window.setTimeout(preload, 200);
  }
}

interface LazyCodeHighlightProps {
  code: string;
  language: string;
}

/**
 * `CodeHighlight` for fenced code blocks, loaded outside the page's initial
 * JavaScript. If a block renders before the highlighter has loaded, the code
 * shows as plain preformatted text until it arrives.
 */
export function LazyCodeHighlight({ code, language }: LazyCodeHighlightProps) {
  return (
    <Suspense
      fallback={
        <pre className="overflow-x-auto p-4 font-mono text-sm">
          <code>{code}</code>
        </pre>
      }
    >
      <CodeHighlight code={code} language={language} />
    </Suspense>
  );
}
