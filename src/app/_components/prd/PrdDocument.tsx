"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { markdownToDoc, EMPTY_DOC, isDocEmpty } from "~/lib/prd/codec";

interface PrdDocumentProps {
  featureId: string;
  /** Canonical ProseMirror document; null until the feature is first migrated. */
  descriptionDoc: JSONContent | null;
  /** Legacy/derived Markdown projection — source of the one-time migration. */
  description: string | null;
}

/**
 * Read-only renderer for the **PRD body** (ADR-0024). This is the single Tiptap
 * component that replaces `MarkdownRenderer` on the Feature detail page; a later
 * slice toggles `editable` on top of it for in-place WYSIWYG editing.
 *
 * Read path with lazy migration: if `descriptionDoc` already exists it is
 * rendered directly. If not, the legacy `description` Markdown is converted to
 * ProseMirror JSON on first load (client-side — the codec needs a DOM),
 * rendered, and persisted via `initDescriptionDoc` so the JSON becomes
 * canonical thereafter. The Markdown is never read back into the editor again.
 */
export function PrdDocument({
  featureId,
  descriptionDoc,
  description,
}: PrdDocumentProps) {
  const [doc, setDoc] = useState<JSONContent | null>(descriptionDoc);
  const migrationStarted = useRef(false);

  const initDescriptionDoc = api.product.feature.initDescriptionDoc.useMutation();

  // Resolve the document to render, migrating legacy Markdown once.
  useEffect(() => {
    if (descriptionDoc) {
      setDoc(descriptionDoc);
      return;
    }
    if (migrationStarted.current) return;
    migrationStarted.current = true;

    if (!description || description.trim() === "") {
      setDoc(EMPTY_DOC);
      return;
    }
    const converted = markdownToDoc(description);
    setDoc(converted);
    initDescriptionDoc.mutate({ id: featureId, doc: converted });
    // initDescriptionDoc is stable; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptionDoc, description, featureId]);

  const editor = useEditor({
    editable: false,
    extensions: buildPrdExtensions(),
    content: doc ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
    },
  });

  // Push the resolved doc into the editor once both are ready.
  useEffect(() => {
    if (editor && doc) {
      editor.commands.setContent(doc);
    }
  }, [editor, doc]);

  if (doc && isDocEmpty(doc)) {
    return (
      <Text size="sm" className="text-text-muted">
        No description provided.
      </Text>
    );
  }

  return <EditorContent editor={editor} className="prd-document" />;
}
