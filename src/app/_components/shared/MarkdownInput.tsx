"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ActionIcon, SegmentedControl, Textarea, Tooltip } from "@mantine/core";
import {
  IconBold,
  IconItalic,
  IconList,
  IconLink,
} from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

interface MarkdownInputProps {
  value: string;
  /** Called with the new value and the caret position after the change. */
  onChange: (value: string, cursorPos: number) => void;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  /** Names rendered as mention badges in the preview. */
  mentionNames?: string[];
  /** Receives the underlying textarea element (for cursor/mention handling). */
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Hint / helper row under the editor (e.g. "Cmd+Enter to send"). */
  hint?: ReactNode;
  /** Slot rendered on the toolbar's right (e.g. a send button). */
  rightSection?: ReactNode;
  /** Overlay rendered inside the editor's relative container (mention dropdown). */
  overlay?: ReactNode;
  /** Visual style of the textarea. */
  variant?: "default" | "unstyled";
}

type ToolbarAction = "bold" | "italic" | "list" | "link";

/**
 * Canonical Markdown input (ADR-0016): an autosizing textarea with a small
 * formatting toolbar and a Write|Preview toggle. Always emits Markdown — never
 * HTML. Preview renders through the canonical MarkdownRenderer (compact), so
 * what you preview is exactly what the feed will show.
 *
 * Controlled: the parent owns `value`. Mentions and image paste are layered on
 * by the parent via onChange/onKeyDown/onPaste (see CommentInput).
 */
export function MarkdownInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  minRows = 3,
  maxRows = 10,
  mentionNames,
  textareaRef,
  onKeyDown,
  onPaste,
  hint,
  rightSection,
  overlay,
  variant = "default",
}: MarkdownInputProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const elRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      elRef.current = el;
      textareaRef?.(el);
    },
    [textareaRef],
  );

  const applyAction = useCallback(
    (action: ToolbarAction) => {
      const el = elRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const selected = value.slice(start, end);

      let next = value;
      let cursor = end;

      if (action === "bold" || action === "italic") {
        const marker = action === "bold" ? "**" : "*";
        const inner = selected || (action === "bold" ? "bold text" : "italic text");
        next = value.slice(0, start) + marker + inner + marker + value.slice(end);
        cursor = start + marker.length + inner.length + marker.length;
      } else if (action === "link") {
        const text = selected || "text";
        const snippet = `[${text}](url)`;
        next = value.slice(0, start) + snippet + value.slice(end);
        cursor = start + snippet.length;
      } else if (action === "list") {
        // Prefix each line of the selection (or the current line) with "- ".
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const block = value.slice(lineStart, end) || "";
        const prefixed = block
          .split("\n")
          .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
          .join("\n");
        next = value.slice(0, lineStart) + prefixed + value.slice(end);
        cursor = lineStart + prefixed.length;
      }

      onChange(next, cursor);
      // Restore focus + caret after the controlled re-render.
      requestAnimationFrame(() => {
        const node = elRef.current;
        if (node) {
          node.focus();
          node.setSelectionRange(cursor, cursor);
        }
      });
    },
    [onChange, value],
  );

  const toolbarButton = (
    action: ToolbarAction,
    label: string,
    Icon: typeof IconBold,
  ) => (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        disabled={disabled}
        onClick={() => applyAction(action)}
        aria-label={label}
      >
        <Icon size={16} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(v) => setTab(v as "write" | "preview")}
          data={[
            { label: "Write", value: "write" },
            { label: "Preview", value: "preview" },
          ]}
        />
        {tab === "write" && (
          <div className="flex items-center gap-0.5">
            {toolbarButton("bold", "Bold", IconBold)}
            {toolbarButton("italic", "Italic", IconItalic)}
            {toolbarButton("list", "Bullet list", IconList)}
            {toolbarButton("link", "Link", IconLink)}
          </div>
        )}
        {rightSection && <div className="ml-auto">{rightSection}</div>}
      </div>

      {tab === "write" ? (
        <div className="relative">
          <Textarea
            ref={setRef}
            value={value}
            onChange={(e) =>
              onChange(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
            }
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            minRows={minRows}
            maxRows={maxRows}
            autosize
            variant={variant === "unstyled" ? "unstyled" : "default"}
            disabled={disabled}
            styles={
              variant === "unstyled"
                ? { input: { color: "var(--text-primary)", padding: 0 } }
                : {
                    input: {
                      backgroundColor: "var(--surface-secondary)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)",
                    },
                  }
            }
          />
          {overlay}
        </div>
      ) : (
        <div className="min-h-[4rem] rounded-md border border-border-primary bg-surface-secondary px-3 py-2">
          {value.trim() ? (
            <MarkdownRenderer
              content={value}
              variant="compact"
              mentionNames={mentionNames}
            />
          ) : (
            <p className="text-sm text-text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}

      {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}
