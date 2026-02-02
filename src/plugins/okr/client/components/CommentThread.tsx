"use client";

import { Text, Avatar, ActionIcon, Group } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";

interface CommentAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  author: CommentAuthor;
}

interface CommentThreadProps {
  comments: Comment[];
  onDeleteComment?: (commentId: string) => void;
  currentUserId?: string;
}

/**
 * Displays a thread of comments with author avatars and timestamps.
 */
export function CommentThread({
  comments,
  onDeleteComment,
  currentUserId,
}: CommentThreadProps) {
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
        const canDelete = !currentUserId || author.id === currentUserId;

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
                  </Group>
                  <Text size="sm" className="text-text-secondary whitespace-pre-wrap">
                    {comment.content}
                  </Text>
                </div>
              </Group>

              {canDelete && onDeleteComment && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="xs"
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={() => onDeleteComment(comment.id)}
                  aria-label="Delete comment"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              )}
            </Group>
          </div>
        );
      })}
    </div>
  );
}
