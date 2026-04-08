"use client";

import { useCallback, useRef } from "react";
import { RichTextEditor } from "@mantine/tiptap";
import { BubbleMenu, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { api } from "~/trpc/react";
import "@mantine/tiptap/styles.css";

interface GoalDescriptionEditorProps {
  goalId: number;
  goalTitle: string;
  initialContent: string | null;
}

export function GoalDescriptionEditor({
  goalId,
  goalTitle,
  initialContent,
}: GoalDescriptionEditorProps) {
  const utils = api.useUtils();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateGoal = api.goal.updateGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getById.invalidate({ id: goalId });
    },
  });

  const saveDescription = useCallback(
    (html: string) => {
      const sanitized = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
          "u",
          "s",
          "a",
          "h1",
          "h2",
          "h3",
          "h4",
          "ul",
          "ol",
          "li",
          "blockquote",
          "code",
          "pre",
          "mark",
          "hr",
        ],
        ALLOWED_ATTR: ["href", "target", "rel", "class"],
        ALLOW_DATA_ATTR: false,
      });
      // Treat empty editor as null
      const isEmpty = sanitized === "<p></p>" || sanitized === "";
      updateGoal.mutate({
        id: goalId,
        title: goalTitle,
        description: isEmpty ? "" : sanitized,
      });
    },
    [goalId, goalTitle, updateGoal],
  );

  const debouncedSave = useCallback(
    (html: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveDescription(html), 1000);
    },
    [saveDescription],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-brand-primary underline cursor-pointer",
        },
      }),
      Placeholder.configure({
        placeholder: "Add a description...",
      }),
    ],
    content: initialContent ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      debouncedSave(e.getHTML());
    },
    onBlur: ({ editor: e }) => {
      // Save immediately on blur
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveDescription(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
    },
  });

  return (
    <RichTextEditor
      editor={editor}
      styles={{
        root: {
          border: "none",
          backgroundColor: "transparent",
        },
        content: {
          backgroundColor: "transparent",
          color: "var(--color-text-primary)",
          fontSize: "14px",
          padding: 0,
          "& .ProseMirror": {
            padding: "4px 0",
            minHeight: "1.5em",
          },
          "& .ProseMirror p.is-editor-empty:first-of-type::before": {
            color: "var(--mantine-color-dimmed)",
            fontStyle: "italic",
          },
        },
      }}
    >
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 150 }}
        >
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.Code />
            <RichTextEditor.Link />
            <RichTextEditor.H1 />
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
            <RichTextEditor.H4 />
          </RichTextEditor.ControlsGroup>
        </BubbleMenu>
      )}
      <RichTextEditor.Content />
    </RichTextEditor>
  );
}
