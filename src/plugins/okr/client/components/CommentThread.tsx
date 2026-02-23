"use client";

import { useState } from "react";
import { Text, Avatar, ActionIcon, Group, Textarea, Button } from "@mantine/core";
import { IconTrash, IconPencil } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";
import { InlineImageRenderer } from "~/app/_components/shared/InlineImageRenderer";

interface CommentAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  author: CommentAuthor;
}

interface CommentThreadProps {
  comments: Comment[];
  onDeleteComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, newContent: string) => Promise<void>;
  currentUserId?: string;
  mentionNames?: string[];
}

/**
 * Displays a thread of comments with author avatars and timestamps.
 * Supports inline editing and @mention rendering.
 */
export function CommentThread({
  comments,
  onDeleteComment,
  onEditComment,
  currentUserId,
  mentionNames = [],
}: CommentThreadProps) {
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditContent("");
  };

  const saveEdit = async () => {
    if (!editingCommentId || !editContent.trim() || !onEditComment) return;
    setIsSaving(true);
    try {
      await onEditComment(editingCommentId, editContent.trim());
      setEditingCommentId(null);
      setEditContent("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      cancelEditing();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void saveEdit();
    }
  };

  if (comments.length === 0) {
    return (
      <Text size="sm" className="text-text-muted py-4 text-center">
        No comments yet. Start the discussion!
      </Text>
    );
  }

  return (
    <div className="space-y-3 mb-4">
      {comments.map((comment) => {
        const author = comment.author;
        const colorSeed = getColorSeed(author.name, null);
        const avatarBgColor = !author.image ? getAvatarColor(colorSeed) : undefined;
        const avatarTextColor = avatarBgColor ? getTextColor(avatarBgColor) : "white";
        const initial = getInitial(author.name, null);
        const isOwnComment = currentUserId != null && author.id === currentUserId;
        const isEditing = editingCommentId === comment.id;
        const isEdited =
          comment.updatedAt &&
          new Date(comment.updatedAt).getTime() >
            new Date(comment.createdAt).getTime() + 1000;

        return (
          <div
            key={comment.id}
            className="group p-3 rounded-lg bg-surface-secondary hover:bg-surface-hover transition-colors"
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Avatar
                  size="sm"
                  src={author.image}
                  radius="xl"
                  styles={{
                    root: {
                      backgroundColor: avatarBgColor,
                      color: avatarTextColor,
                      fontWeight: 600,
                      fontSize: "12px",
                      flexShrink: 0,
                    },
                  }}
                >
                  {!author.image && initial}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Group gap="xs" mb={2}>
                    <Text size="sm" fw={500} className="text-text-primary">
                      {author.name ?? "Anonymous"}
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {formatDistanceToNow(new Date(comment.createdAt), {
                        addSuffix: true,
                      })}
                    </Text>
                    {isEdited && (
                      <Text size="xs" className="text-text-muted">
                        (edited)
                      </Text>
                    )}
                  </Group>

                  {isEditing ? (
                    <div>
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.currentTarget.value)}
                        onKeyDown={handleEditKeyDown}
                        minRows={2}
                        maxRows={6}
                        autosize
                        autoFocus
                        disabled={isSaving}
                        styles={{
                          input: {
                            backgroundColor: "var(--surface-primary)",
                            borderColor: "var(--border-focus)",
                            color: "var(--text-primary)",
                          },
                        }}
                      />
                      <Group gap="xs" mt="xs">
                        <Button
                          size="xs"
                          variant="filled"
                          color="brand"
                          onClick={() => void saveEdit()}
                          loading={isSaving}
                          disabled={!editContent.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={cancelEditing}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                      </Group>
                    </div>
                  ) : (
                    <div className="text-sm text-text-secondary">
                      <InlineImageRenderer
                        content={comment.content}
                        mentionNames={mentionNames}
                      />
                    </div>
                  )}
                </div>
              </Group>

              {isOwnComment && !isEditing && (
                <Group gap={4} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {onEditComment && (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={() => startEditing(comment)}
                      aria-label="Edit comment"
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  )}
                  {onDeleteComment && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={() => onDeleteComment(comment.id)}
                      aria-label="Delete comment"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              )}
            </Group>
          </div>
        );
      })}
    </div>
  );
}
