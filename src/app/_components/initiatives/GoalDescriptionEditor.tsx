"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { detectContentType, htmlToMarkdown } from "~/lib/content/contentFormat";

interface GoalDescriptionEditorProps {
  goalId: number;
  goalTitle: string;
  initialContent: string | null;
}

/**
 * Convert a stored description into editable Markdown. Legacy values authored by
 * the old Tiptap editor are stored as HTML — convert those once, on open. Values
 * already stored as Markdown (or plain text) pass through unchanged. This is the
 * "convert-on-edit" pattern from ADR-0017: HTML ages out lazily as descriptions
 * are edited; nothing is bulk-migrated.
 */
function toEditableMarkdown(content: string | null): string {
  if (!content) return "";
  return detectContentType(content) === "html"
    ? htmlToMarkdown(content)
    : content;
}

/**
 * Objective (Goal) description editor. Emits canonical Markdown via the shared
 * MarkdownInput; autosaves debounced while typing and flushes on blur/unmount.
 * Display is handled elsewhere by the HTML-tolerant MarkdownRenderer, so an
 * un-edited legacy HTML description still renders without conversion.
 */
export function GoalDescriptionEditor({
  goalId,
  goalTitle,
  initialContent,
}: GoalDescriptionEditorProps) {
  const utils = api.useUtils();
  const [value, setValue] = useState(() => toEditableMarkdown(initialContent));
  const valueRef = useRef(value);
  const lastSavedRef = useRef(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateGoal = api.goal.updateGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getById.invalidate({ id: goalId });
    },
  });

  const save = useCallback(
    (markdown: string) => {
      // Skip no-op saves — including the very first blur on an unchanged legacy
      // description, so opening a Goal never rewrites HTML to Markdown until the
      // user actually edits it.
      if (markdown === lastSavedRef.current) return;
      lastSavedRef.current = markdown;
      updateGoal.mutate({
        id: goalId,
        title: goalTitle,
        description: markdown.trim() === "" ? "" : markdown,
      });
    },
    [goalId, goalTitle, updateGoal],
  );

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      valueRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1000);
    },
    [save],
  );

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    save(valueRef.current);
  }, [save]);

  // Flush any pending edit on unmount without re-subscribing the effect on
  // every render (a ref keeps the latest flush).
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => flushRef.current(), []);

  // onBlur bubbles from the textarea (React uses focusout), so a wrapper here
  // catches focus leaving the input and saves immediately.
  return (
    <div onBlur={flush}>
      <MarkdownInput
        value={value}
        onChange={handleChange}
        placeholder="Add a description..."
        minRows={2}
      />
    </div>
  );
}
