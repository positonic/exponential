"use client";

import { useState } from "react";
import { Textarea, ActionIcon, Group } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
  placeholder?: string;
}

/**
 * Input component for adding comments with a send button.
 */
export function CommentInput({
  onSubmit,
  isSubmitting = false,
  placeholder = "Add a comment...",
}: CommentInputProps) {
  const [content, setContent] = useState("");

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    try {
      await onSubmit(trimmedContent);
      setContent("");
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to add comment. Please try again.",
        color: "red",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="mt-2">
      <Group gap="xs" align="flex-end">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
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
      <p className="text-xs text-text-muted mt-1">
        Press Cmd+Enter to send
      </p>
    </div>
  );
}
