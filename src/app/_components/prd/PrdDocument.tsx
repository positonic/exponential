"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, BubbleMenu, useEditor } from "@tiptap/react";
import { RichTextEditor } from "@mantine/tiptap";
import type { Editor, JSONContent } from "@tiptap/core";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { SlashCommand } from "~/lib/prd/slash-command";
import { markdownToDoc, EMPTY_DOC, isDocEmpty } from "~/lib/prd/codec";
import "@mantine/tiptap/styles.css";

interface PrdDocumentProps {
  featureId: string;
  /** Canonical ProseMirror document; null until the feature is first migrated. */
  descriptionDoc: JSONContent | null;
  /** Legacy/derived Markdown projection — source of the one-time migration. */
  description: string | null;
  /** Stored doc version, the base for the optimistic-concurrency check. */
  docVersion?: number;
  /** Workspace members edit in place; everyone else gets a read-only render. */
  editable?: boolean;
}

/**
 * The single Tiptap component for the **PRD body** (ADR-0024), with `editable`
 * toggled by permission. Read mode renders `descriptionDoc` (lazily migrating a
 * legacy Markdown `description` on first load). Edit mode adds the Tier B
 * surface — selection bubble menu, `/` slash-command block menu, task lists,
 * code blocks, placeholder — with debounced autosave and an
 * optimistic-concurrency stale-write guard that prompts a reload rather than
 * clobbering a newer save.
 *
 * The Markdown projection is derived here (`editor.storage.markdown`) and sent
 * alongside the JSON on save; the JSON stays canonical and the Markdown is never
 * read back into the editor.
 */
export function PrdDocument({
  featureId,
  descriptionDoc,
  description,
  docVersion = 0,
  editable = false,
}: PrdDocumentProps) {
  const [doc, setDoc] = useState<JSONContent | null>(descriptionDoc);
  const migrationStarted = useRef(false);
  const contentLoaded = useRef(false);

  // Version the next save must match. Updated from each save's response; never
  // reset from props mid-edit (we don't refetch the body while editing).
  const versionRef = useRef(docVersion);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictShown = useRef(false);

  const initDescriptionDoc = api.product.feature.initDescriptionDoc.useMutation();
  const updateFeature = api.product.feature.update.useMutation();

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

  // Latest save fn behind a ref so the editor's onUpdate closure never goes stale.
  const saveRef = useRef<(editor: Editor) => void>(() => undefined);
  saveRef.current = (editor: Editor) => {
    const json = editor.getJSON();
    const markdown = (
      editor.storage.markdown as { getMarkdown: () => string }
    ).getMarkdown();
    updateFeature.mutate(
      {
        id: featureId,
        descriptionDoc: json,
        description: markdown,
        baseVersion: versionRef.current,
      },
      {
        onSuccess: (res) => {
          if (res && typeof (res as { docVersion?: number }).docVersion === "number") {
            versionRef.current = (res as { docVersion: number }).docVersion;
          }
        },
        onError: (err) => {
          if (err.data?.code === "CONFLICT" && !conflictShown.current) {
            conflictShown.current = true;
            modals.openConfirmModal({
              title: "This PRD changed",
              children: (
                <Text size="sm">
                  Someone else saved a newer version of this PRD. Reload to get the
                  latest? Unsaved changes in this tab will be lost.
                </Text>
              ),
              labels: { confirm: "Reload", cancel: "Keep editing" },
              onConfirm: () => window.location.reload(),
              onCancel: () => {
                conflictShown.current = false;
              },
            });
          }
        },
      },
    );
  };

  const editor = useEditor({
    editable,
    extensions: editable
      ? [...buildPrdExtensions(), SlashCommand]
      : buildPrdExtensions(),
    content: doc ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveRef.current(e), 1000);
    },
    onBlur: ({ editor: e }) => {
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveRef.current(e);
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
    },
  });

  // Load the resolved doc into the editor exactly once (never clobber edits).
  useEffect(() => {
    if (editor && doc && !contentLoaded.current) {
      contentLoaded.current = true;
      editor.commands.setContent(doc);
    }
  }, [editor, doc]);

  if (!editable && doc && isDocEmpty(doc)) {
    return (
      <Text size="sm" className="text-text-muted">
        No description provided.
      </Text>
    );
  }

  if (!editable) {
    return <EditorContent editor={editor} className="prd-document" />;
  }

  return (
    <RichTextEditor
      editor={editor}
      className="prd-document"
      styles={{
        root: { border: "none", backgroundColor: "transparent" },
        content: { backgroundColor: "transparent", padding: 0 },
      }}
    >
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Code />
            <RichTextEditor.Link />
            <RichTextEditor.H1 />
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
          </RichTextEditor.ControlsGroup>
        </BubbleMenu>
      )}
      <RichTextEditor.Content />
    </RichTextEditor>
  );
}
