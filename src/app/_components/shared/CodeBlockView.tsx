"use client";

import { useEffect, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { NodeViewRendererProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Button } from "@mantine/core";
import { IconCode } from "@tabler/icons-react";
import CodeBlock from "@tiptap/extension-code-block";
import { MermaidDiagram } from "./MermaidDiagram";

const MERMAID = "mermaid";

const isMermaid = (node: ProseMirrorNode) => node.attrs.language === MERMAID;

/**
 * A ```mermaid code block: the rendered diagram, with its source tucked away
 * behind a toggle. The source opens on its own when it is empty (a block just
 * created) or when the cursor moves into it, so it can never be edited
 * unseen.
 */
function MermaidBlockView({ node, editor, getPos }: NodeViewProps) {
  const source = node.textContent;
  const [sourceOpen, setSourceOpen] = useState(false);
  const [cursorInside, setCursorInside] = useState(false);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useEffect(() => {
    if (!editor.isEditable) return;
    const onSelection = () => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      const { from, to } = editor.state.selection;
      setCursorInside(from > pos && to < pos + nodeRef.current.nodeSize);
    };
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, getPos]);

  const isEmpty = source.trim() === "";
  const showSource = sourceOpen || cursorInside || isEmpty;
  const toggleLabel = sourceOpen
    ? "Hide source"
    : editor.isEditable
      ? "Edit source"
      : "View source";

  return (
    <NodeViewWrapper
      data-type="mermaid-block"
      className="mermaid-block my-4 overflow-hidden rounded-lg border border-border-primary"
    >
      <div contentEditable={false} className="relative">
        {isEmpty ? (
          <p className="px-4 pt-3 text-sm text-text-muted">
            Mermaid diagram — write its source below.
          </p>
        ) : (
          <MermaidDiagram code={source} showSourceOnError={false} />
        )}
        {isEmpty ? null : (
          <div className="flex justify-end px-2 pb-2">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconCode size={14} />}
              onClick={() => setSourceOpen((open) => !open)}
            >
              {toggleLabel}
            </Button>
          </div>
        )}
      </div>
      <pre className={showSource ? "!m-0 !rounded-none" : "hidden"}>
        <NodeViewContent as="code" className="language-mermaid" />
      </pre>
    </NodeViewWrapper>
  );
}

/**
 * Every other code block keeps the plain `<pre><code>` the schema renders —
 * no React node view per block. Changing its language to mermaid swaps in
 * the diagram view.
 */
function plainCodeBlockView({ node }: NodeViewRendererProps) {
  const dom = document.createElement("pre");
  const contentDOM = document.createElement("code");
  const language = node.attrs.language as string | null;
  if (language) contentDOM.className = `language-${language}`;
  dom.append(contentDOM);
  return {
    dom,
    contentDOM,
    update: (next: ProseMirrorNode) =>
      next.type === node.type && next.attrs.language === language,
  };
}

/** The code block with diagram rendering — what the live editor uses in
 * place of the headless base node. */
export const CodeBlockWithView = CodeBlock.extend({
  addNodeView() {
    const renderMermaidBlock = ReactNodeViewRenderer(MermaidBlockView, {
      // Changing the language away from mermaid swaps back to the plain view.
      update: ({ newNode, updateProps }) => {
        if (!isMermaid(newNode)) return false;
        updateProps();
        return true;
      },
    });
    return (props) =>
      isMermaid(props.node) ? renderMermaidBlock(props) : plainCodeBlockView(props);
  },
});
