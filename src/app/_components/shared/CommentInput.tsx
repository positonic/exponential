"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ActionIcon } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import {
  useMentionAutocomplete,
  type MentionCandidate,
} from "~/hooks/useMentionAutocomplete";
import { MentionDropdown } from "~/app/_components/MentionDropdown";
import { useImagePaste } from "~/hooks/useImagePaste";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
  placeholder?: string;
  mentionCandidates?: MentionCandidate[];
  actionId?: string;
}

/**
 * Input for adding comments — the canonical Markdown input (toolbar +
 * Write/Preview) plus @mention autocomplete and image paste (ADR-0016).
 * Always emits Markdown.
 */
export function CommentInput({
  onSubmit,
  isSubmitting = false,
  placeholder = "Add a comment...",
  mentionCandidates,
  actionId,
}: CommentInputProps) {
  const hasMentions = mentionCandidates && mentionCandidates.length > 0;
  const [plainContent, setPlainContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mention = useMentionAutocomplete({
    candidates: mentionCandidates ?? [],
  });

  // The active content: use mention-managed text when mentions are enabled
  const content = hasMentions ? mention.text : plainContent;
  const setContent = hasMentions ? mention.setText : setPlainContent;

  const mentionNames = mentionCandidates?.map((c) => c.name);

  // Image paste handling
  const { handlePaste: handleImagePaste, isUploading } = useImagePaste({
    actionId: actionId ?? "",
    onImageUploaded: (markdownRef) => {
      setContent(content + markdownRef + " ");
    },
  });

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    try {
      await onSubmit(trimmedContent);
      setContent("");
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to add comment. Please try again.",
        color: "red",
      });
    }
  }, [content, onSubmit, setContent]);

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      if (hasMentions) {
        mention.handleInputChange(value, cursorPos);
      } else {
        setPlainContent(value);
      }
    },
    [hasMentions, mention],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Let mention hook handle dropdown keys first
      if (hasMentions && mention.handleKeyDown(e)) {
        return;
      }

      // Submit on Cmd/Ctrl + Enter
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [hasMentions, mention, handleSubmit],
  );

  // After mention selection, restore cursor position in textarea
  useEffect(() => {
    if (hasMentions && textareaRef.current) {
      const pos = mention.cursorPosition;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    }
    // Only run when cursorPosition changes from mention selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention.cursorPosition]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!mention.showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        mention.dismissDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mention.showDropdown, mention]);

  return (
    <div className="mt-2">
      <MarkdownInput
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={actionId ? handleImagePaste : undefined}
        placeholder={placeholder}
        minRows={2}
        maxRows={6}
        disabled={isSubmitting || isUploading}
        mentionNames={mentionNames}
        textareaRef={(el) => (textareaRef.current = el)}
        rightSection={
          <ActionIcon
            variant="filled"
            color="brand"
            size="lg"
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={!content.trim() || isSubmitting}
            aria-label="Send comment"
          >
            <IconSend size={18} />
          </ActionIcon>
        }
        overlay={
          hasMentions && mention.showDropdown ? (
            <MentionDropdown
              ref={dropdownRef}
              candidates={mention.filteredCandidates}
              selectedIndex={mention.selectedIndex}
              onSelect={mention.selectCandidate}
              onHoverIndex={(index) => {
                mention.setSelectedIndex(index);
              }}
            />
          ) : null
        }
        hint={
          <>
            Press Cmd+Enter to send{hasMentions ? " | @ to mention" : ""}
            {actionId ? " | Paste images" : ""}
            {isUploading ? " | Uploading image..." : ""}
          </>
        }
      />
    </div>
  );
}
