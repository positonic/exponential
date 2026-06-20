"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { RichTextEditor } from "@mantine/tiptap";
import { BubbleMenu, useEditor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { markdownToDoc, EMPTY_DOC } from "~/lib/prd/codec";
import "@mantine/tiptap/styles.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface TicketBodyEditorProps {
  ticketId: string;
  initialContent: string | null;
}

export function TicketBodyEditor({ ticketId, initialContent }: TicketBodyEditorProps) {
  const utils = api.useUtils();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentLoaded = useRef(false);

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });

  const uploadImage = api.product.ticket.uploadImage.useMutation();

  const saveBody = useCallback(
    (markdown: string) => {
      updateTicket.mutate({ id: ticketId, body: markdown.trim() === "" ? "" : markdown });
    },
    [ticketId, updateTicket],
  );

  const debouncedSave = useCallback(
    (markdown: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveBody(markdown), 1000);
    },
    [saveBody],
  );

  const imageHandlers = useMemo(() => {
    const insertImage = (view: EditorView, file: File, pos?: number): boolean => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_IMAGE_BYTES) {
        notifications.show({ title: "Image too large", message: "Please use an image under 5MB.", color: "red" });
        return true;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") return;
        const base64 = result.split(",")[1];
        if (!base64) return;
        uploadImage
          .mutateAsync({ id: ticketId, base64Data: base64 })
          .then((res) => {
            const { state } = view;
            const node = state.schema.nodes.image?.create({ src: res.url });
            if (!node) return;
            const at = pos ?? state.selection.from;
            view.dispatch(state.tr.insert(at, node));
          })
          .catch(() => {
            notifications.show({ title: "Upload failed", message: "Could not upload the image. Please try again.", color: "red" });
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
  }, [ticketId, uploadImage]);

  const editor = useEditor({
    extensions: buildPrdExtensions({ placeholder: "Add a description..." }),
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      debouncedSave(
        (e.storage.markdown as { getMarkdown: () => string }).getMarkdown(),
      );
    },
    onBlur: ({ editor: e }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveBody(
        (e.storage.markdown as { getMarkdown: () => string }).getMarkdown(),
      );
    },
    editorProps: {
      attributes: { class: "prose prose-invert max-w-none focus:outline-none" },
      handlePaste: imageHandlers.handlePaste,
      handleDrop: imageHandlers.handleDrop,
    },
  });

  // Load content exactly once - convert markdown to ProseMirror JSON first so
  // markdown-it is never called during editor initialisation (avoids an isSpace
  // Turbopack bundling bug when parsing markdown inline).
  useEffect(() => {
    if (editor && !contentLoaded.current) {
      contentLoaded.current = true;
      const doc = initialContent?.trim() ? markdownToDoc(initialContent) : EMPTY_DOC;
      editor.commands.setContent(doc);
    }
  }, [editor, initialContent]);

  return (
    <RichTextEditor
      editor={editor}
      className="prd-document"
      styles={{
        root: { border: "none", backgroundColor: "transparent" },
        content: {
          backgroundColor: "transparent",
          color: "var(--color-text-primary)",
          fontSize: "14px",
          padding: 0,
        },
      }}
    >
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Strikethrough />
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
