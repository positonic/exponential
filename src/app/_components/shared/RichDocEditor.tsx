"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, BubbleMenu, useEditor } from "@tiptap/react";
import { RichTextEditor } from "@mantine/tiptap";
import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTrash,
  type TablerIcon,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { SlashCommand, type SlashCommandItem } from "~/lib/prd/slash-command";
import { markdownToDoc, EMPTY_DOC, isDocEmpty } from "~/lib/prd/codec";
import { createSaveQueue } from "~/lib/prd/save-queue";
import { PageLinkWithView } from "./PageLinkView";
import "@mantine/tiptap/styles.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Imperative handle the comment layer (or any host) needs from the engine. */
export interface RichDocEditorHandle {
  editor: Editor | null;
  /** Cancel any pending debounced autosave and persist immediately. Resolves
   * once the save has settled, so a host can await it before navigating away
   * (a rejected save resolves too — the conflict modal handles the error). */
  flushSave: () => Promise<void>;
}

export interface RichDocEditorProps {
  /** Canonical ProseMirror document; null until first migrated. */
  initialDoc: JSONContent | null;
  /** Legacy/derived Markdown projection — source of the one-time migration. */
  initialMarkdown: string | null;
  /** Stored doc version, the base for the optimistic-concurrency check. */
  docVersion?: number;
  /** Members edit in place; everyone else gets a read-only render. */
  editable?: boolean;
  placeholder?: string;
  /** Title + message for the stale-write conflict modal. */
  conflict?: { title: string; message: string };
  /**
   * Persist a save. Returns the new stored `docVersion` so the engine can
   * advance its optimistic-concurrency base. Throw a tRPC CONFLICT to trigger
   * the stale-write modal.
   */
  onSave: (input: {
    doc: JSONContent;
    markdown: string;
    baseVersion: number;
  }) => Promise<{ docVersion?: number } | undefined | void>;
  /** Persist the one-time lazy migration of legacy Markdown → ProseMirror JSON. */
  onInitDoc?: (doc: JSONContent) => void;
  /** Upload a pasted/dropped image (base64 in, public URL out). */
  uploadImage?: (base64Data: string) => Promise<{ url: string }>;

  // ───────── optional host layer (e.g. Feature comments) ─────────
  /** Extra Tiptap extensions layered on top of the shared set. */
  extraExtensions?: Extensions;
  /** Extra `/` slash-menu commands appended after the built-in blocks. */
  slashExtras?: SlashCommandItem[];
  /** Extra bubble-menu controls (rendered after the formatting group). */
  bubbleExtras?: React.ReactNode;
  /** Fires on every doc change, so a host can re-read live marks. */
  onDocUpdate?: () => void;
  /** Receives the imperative handle once the editor is ready. */
  onReady?: (handle: RichDocEditorHandle) => void;
  /** Click handler on the editor (e.g. open a comment thread). */
  editorClick?: (view: EditorView, pos: number) => boolean;
  /** Wrapper ref, so a host can position overlays relative to the editor. */
  wrapperRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** Rendered inside the editor wrapper (e.g. an anchored thread popover). */
  overlay?: React.ReactNode;
  /** Rendered below the editor (e.g. a discussion panel). */
  footer?: React.ReactNode;
}

/**
 * The shared rich-document editor engine (ADR-0024): a Tiptap surface with the
 * canonical-ProseMirror-plus-Markdown-projection storage model, debounced
 * autosave, lazy Markdown→JSON migration, an optimistic-concurrency stale-write
 * guard, slash menu, task lists and image paste. Storage specifics (which
 * mutation persists the doc, how images upload) are injected, so both the
 * Feature body (`FeatureBodyDocument`) and Knowledge Pages (`PageDocument`) share one
 * engine. Comment/thread UI is NOT part of the engine; a host layers it on via
 * the optional extension points (`extraExtensions`, `bubbleExtras`, `overlay`,
 * `footer`, `editorClick`, `onReady`).
 */

/** Row/column controls for the table bubble menu (shown when the cursor sits in
 * a table with an empty selection — a non-empty selection surfaces the text
 * formatting menu instead, so the two never overlap). */
function TableControls({ editor }: { editor: Editor }) {
  const actions: { label: string; icon: TablerIcon; run: () => void }[] = [
    {
      label: "Add column before",
      icon: IconColumnInsertLeft,
      run: () => editor.chain().focus().addColumnBefore().run(),
    },
    {
      label: "Add column after",
      icon: IconColumnInsertRight,
      run: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      label: "Delete column",
      icon: IconColumnRemove,
      run: () => editor.chain().focus().deleteColumn().run(),
    },
    {
      label: "Add row before",
      icon: IconRowInsertTop,
      run: () => editor.chain().focus().addRowBefore().run(),
    },
    {
      label: "Add row after",
      icon: IconRowInsertBottom,
      run: () => editor.chain().focus().addRowAfter().run(),
    },
    {
      label: "Delete row",
      icon: IconRowRemove,
      run: () => editor.chain().focus().deleteRow().run(),
    },
    {
      label: "Delete table",
      icon: IconTrash,
      run: () => editor.chain().focus().deleteTable().run(),
    },
  ];
  return (
    <Group
      gap={2}
      wrap="nowrap"
      className="bg-surface-secondary border-border-primary rounded-md border p-1 shadow-md"
    >
      {actions.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label} label={label} withArrow>
          <ActionIcon variant="subtle" size="sm" aria-label={label} onClick={run}>
            <Icon size={16} />
          </ActionIcon>
        </Tooltip>
      ))}
    </Group>
  );
}

export function RichDocEditor({
  initialDoc,
  initialMarkdown,
  docVersion = 0,
  editable = false,
  placeholder,
  conflict,
  onSave,
  onInitDoc,
  uploadImage,
  extraExtensions,
  slashExtras,
  bubbleExtras,
  onDocUpdate,
  onReady,
  editorClick,
  wrapperRef,
  overlay,
  footer,
}: RichDocEditorProps) {
  const [doc, setDoc] = useState<JSONContent | null>(initialDoc);
  const migrationStarted = useRef(false);
  const contentLoaded = useRef(false);

  const versionRef = useRef(docVersion);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictShown = useRef(false);
  const localWrapperRef = useRef<HTMLDivElement | null>(null);
  const setWrapper = (el: HTMLDivElement | null) => {
    localWrapperRef.current = el;
    if (wrapperRef) wrapperRef.current = el;
  };

  // Image paste/drop handlers, built from the injected uploader. An uploaded
  // image is inserted as an inline `image` node (the codec serialises it to a
  // Markdown image link).
  const imageHandlers = useMemo(() => {
    if (!uploadImage) return null;
    const insertImage = (view: EditorView, file: File, pos?: number): boolean => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_IMAGE_BYTES) {
        notifications.show({
          title: "Image too large",
          message: "Please use an image under 5MB.",
          color: "red",
        });
        return true;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") return;
        const base64 = result.split(",")[1];
        if (!base64) return;
        uploadImage(base64)
          .then((res) => {
            const { state } = view;
            const node = state.schema.nodes.image?.create({ src: res.url });
            if (!node) return;
            const at = pos ?? state.selection.from;
            view.dispatch(state.tr.insert(at, node));
          })
          .catch(() => {
            notifications.show({
              title: "Upload failed",
              message: "Could not upload the image. Please try again.",
              color: "red",
            });
          });
      };
      reader.readAsDataURL(file);
      return true;
    };
    const firstImage = (list?: FileList | null): File | null => {
      if (!list) return null;
      for (const file of Array.from(list)) {
        if (file.type.startsWith("image/")) return file;
      }
      return null;
    };
    return {
      handlePaste: (view: EditorView, event: ClipboardEvent): boolean => {
        const file = firstImage(event.clipboardData?.files);
        if (!file) return false;
        event.preventDefault();
        return insertImage(view, file);
      },
      handleDrop: (view: EditorView, event: DragEvent): boolean => {
        const file = firstImage(event.dataTransfer?.files);
        if (!file) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        return insertImage(view, file, coords?.pos);
      },
    };
  }, [uploadImage]);

  // Resolve the document to render, migrating legacy Markdown once.
  useEffect(() => {
    if (initialDoc) {
      setDoc(initialDoc);
      return;
    }
    if (migrationStarted.current) return;
    migrationStarted.current = true;

    if (!initialMarkdown || initialMarkdown.trim() === "") {
      setDoc(EMPTY_DOC);
      return;
    }
    const converted = markdownToDoc(initialMarkdown);
    setDoc(converted);
    onInitDoc?.(converted);
    // onInitDoc is stable; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDoc, initialMarkdown]);

  // Serialized JSON of the last content persisted (or loaded), so no-op
  // triggers like a plain blur don't fire a save at all.
  const lastSavedRef = useRef<string | null>(null);

  // Latest save fn behind a ref so the queue's closure never goes stale. It
  // reads the editor, content and version base at execution time, and never
  // rejects (the conflict modal handles the error) — the queue relies on that.
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = () => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return Promise.resolve();
    const json = editor.getJSON();
    const serialized = JSON.stringify(json);
    if (serialized === lastSavedRef.current) return Promise.resolve();
    const markdown = (
      editor.storage.markdown as { getMarkdown: () => string }
    ).getMarkdown();
    return onSave({ doc: json, markdown, baseVersion: versionRef.current })
      .then((res) => {
        if (res && typeof res.docVersion === "number") {
          versionRef.current = res.docVersion;
        }
        lastSavedRef.current = serialized;
      })
      .catch((err: { data?: { code?: string } }) => {
        if (err?.data?.code === "CONFLICT" && !conflictShown.current) {
          conflictShown.current = true;
          modals.openConfirmModal({
            title: conflict?.title ?? "This document changed",
            children: (
              <Text size="sm">
                {conflict?.message ??
                  "Someone else saved a newer version. Reload to get the latest? Unsaved changes in this tab will be lost."}
              </Text>
            ),
            labels: { confirm: "Reload", cancel: "Keep editing" },
            onConfirm: () => window.location.reload(),
            onCancel: () => {
              conflictShown.current = false;
            },
          });
        }
      });
  };

  // All triggers (typing debounce, blur, flush) funnel through one queue so
  // saves never overlap — an overlapping save would reuse the base version of
  // the one in flight and trip the server's stale-write guard as a phantom
  // conflict from this same tab.
  const saveQueueRef = useRef(createSaveQueue(() => saveRef.current()));
  const requestSave = () => void saveQueueRef.current.request();

  const flushSave = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await saveQueueRef.current.request();
  };
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    editable,
    extensions: [
      ...buildPrdExtensions({
        ...(placeholder ? { placeholder } : {}),
        pageLink: PageLinkWithView,
      }),
      ...(editable
        ? [SlashCommand.configure({ extraCommands: slashExtras ?? [] })]
        : []),
      ...(extraExtensions ?? []),
    ],
    content: doc ?? "",
    immediatelyRender: false,
    onUpdate: () => {
      onDocUpdate?.();
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(requestSave, 1000);
    },
    onBlur: () => {
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestSave();
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
      ...(editable && imageHandlers
        ? {
            handlePaste: imageHandlers.handlePaste,
            handleDrop: imageHandlers.handleDrop,
          }
        : {}),
      ...(editorClick ? { handleClick: editorClick } : {}),
    },
  });

  editorRef.current = editor;

  // Hand the imperative handle to the host once the editor exists.
  useEffect(() => {
    onReady?.({ editor, flushSave });
    // flushSave is stable enough; re-run when editor changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Load the resolved doc into the editor exactly once (never clobber edits).
  // The dirty baseline is read back from the editor (not from `doc`) because
  // Tiptap normalizes content on load — comparing against the raw input would
  // make an unedited document look dirty.
  useEffect(() => {
    if (editor && doc && !contentLoaded.current) {
      contentLoaded.current = true;
      editor.commands.setContent(doc);
      lastSavedRef.current = JSON.stringify(editor.getJSON());
    }
  }, [editor, doc]);

  let body: React.ReactNode;
  if (!editable && doc && isDocEmpty(doc)) {
    body = (
      <Text size="sm" className="text-text-muted">
        Nothing here yet.
      </Text>
    );
  } else if (!editable) {
    body = <EditorContent editor={editor} className="prd-document" />;
  } else {
    body = (
      <RichTextEditor
        editor={editor}
        className="prd-document"
        styles={{
          root: { border: "none", backgroundColor: "transparent" },
          content: { backgroundColor: "transparent", padding: 0 },
        }}
      >
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="textFormatting"
            tippyOptions={{ duration: 150 }}
          >
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
              {bubbleExtras}
            </RichTextEditor.ControlsGroup>
          </BubbleMenu>
        )}
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="tableControls"
            tippyOptions={{ duration: 150, placement: "top" }}
            shouldShow={({ editor: e }) =>
              (e.isActive("tableCell") || e.isActive("tableHeader")) &&
              e.state.selection.empty
            }
          >
            <TableControls editor={editor} />
          </BubbleMenu>
        )}
        <RichTextEditor.Content />
      </RichTextEditor>
    );
  }

  return (
    <>
      <div ref={setWrapper} className="relative">
        {body}
        {overlay}
      </div>
      {footer}
    </>
  );
}
