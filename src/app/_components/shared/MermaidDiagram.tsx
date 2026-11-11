"use client";

import { useEffect, useState } from "react";
import { useComputedColorScheme } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  mermaidErrorMessage,
  renderMermaidSvg,
} from "~/lib/mermaid/render";

interface MermaidDiagramProps {
  /** Mermaid source, i.e. the body of a ```mermaid fence. */
  code: string;
  /**
   * Show the source under the error when it doesn't parse. Off where the
   * source is already on screen (the editor's node view).
   */
  showSourceOnError?: boolean;
}

type RenderState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

/**
 * Renders a Mermaid diagram, following the app's light/dark scheme. Mermaid
 * loads on first use. While the source is being edited, re-rendering waits
 * for a pause in typing.
 */
export function MermaidDiagram({
  code,
  showSourceOnError = true,
}: MermaidDiagramProps) {
  // Only read in an effect, so a server/client mismatch can't affect markup.
  const scheme = useComputedColorScheme("light");
  const [source] = useDebouncedValue(code, 400);
  const [state, setState] = useState<RenderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    renderMermaidSvg(source, scheme).then(
      (svg) => {
        if (!cancelled) setState({ status: "ready", svg });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: mermaidErrorMessage(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, scheme]);

  if (state.status === "error") {
    return (
      <div className="mermaid-diagram-error space-y-2 p-4">
        <p className="text-sm font-medium text-error">
          Couldn&apos;t render this diagram
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-text-muted">
          {state.message}
        </pre>
        {showSourceOnError ? (
          <pre className="overflow-x-auto rounded-md bg-surface-secondary p-3 font-mono text-sm text-text-primary">
            <code>{code}</code>
          </pre>
        ) : null}
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div
        className="flex min-h-24 items-center justify-center p-4 text-sm text-text-muted"
        aria-busy="true"
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="mermaid-diagram flex justify-center overflow-x-auto p-4"
      role="img"
      aria-label="Diagram"
      // Mermaid output (strict security level) re-sanitised with DOMPurify in
      // renderMermaidSvg, in the browser.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
