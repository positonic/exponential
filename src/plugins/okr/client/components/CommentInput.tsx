"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea, ActionIcon, Group } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import {
  useMentionAutocomplete,
  type MentionCandidate,
} from "~/hooks/useMentionAutocomplete";
import { MentionDropdown } from "~/app/_components/MentionDropdown";

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
  placeholder?: string;
  mentionCandidates?: MentionCandidate[];
}

/**
 * Input component for adding comments with a send button.
 * Optionally supports @mention autocomplete when mentionCandidates is provided.
 */
export function CommentInput({
  onSubmit,
  isSubmitting = false,
  placeholder = "Add a comment...",
  mentionCandidates,
}: CommentInputProps) {
  const hasMentions = mentionCandidates && mentionCandidates.length > 0;
  const [plainContent, setPlainContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mention = useMentionAutocomplete({
    candidates: mentionCandidates ?? [],
  });

  // The active content: use mention-managed text when mentions are enabled
  const content = hasMentions ? mention.text : plainContent;
  const setContent = hasMentions ? mention.setText : setPlainContent;

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
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.currentTarget.value;
      if (hasMentions) {
        const cursorPos = e.currentTarget.selectionStart ?? 0;
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
      <div className="relative">
        <Group gap="xs" align="flex-end">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            minRows={2}
            maxRows={4}
            autosize
            disabled={isSubmitting}
            className="flex-1"
            styles={{
              input: {
                backgroundColor: "var(--surface-secondary)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
                "&::placeholder": {
                  color: "var(--text-muted)",
                },
                "&:focus": {
                  borderColor: "var(--border-focus)",
                },
              },
            }}
          />
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
        </Group>

        {hasMentions && mention.showDropdown && (
          <MentionDropdown
            ref={dropdownRef}
            candidates={mention.filteredCandidates}
            selectedIndex={mention.selectedIndex}
            onSelect={mention.selectCandidate}
            onHoverIndex={(index) => {
              mention.setSelectedIndex(index);
            }}
          />
        )}
      </div>
      <p className="text-xs text-text-muted mt-1">
        Press Cmd+Enter to send{hasMentions ? " | @ to mention" : ""}
      </p>
    </div>
  );
}
