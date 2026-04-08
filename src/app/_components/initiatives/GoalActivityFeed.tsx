"use client";

import { useState } from "react";
import {
  Text,
  Avatar,
  ActionIcon,
  Group,
  Card,
  Menu,
  Popover,
} from "@mantine/core";
import {
  IconTrash,
  IconMessage,
  IconMoodSmile,
  IconDots,
} from "@tabler/icons-react";
import { format, isToday, isYesterday } from "date-fns";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";
import { type HealthStatus, healthConfig } from "./healthConfig";
import { api } from "~/trpc/react";
import type {
  GoalActivityItem,
  GoalActivityComment,
  GoalActivityUpdate,
} from "~/server/api/routers/goalActivity";
import { CommentThread } from "~/app/_components/shared/CommentThread";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import type { Comment } from "~/app/_components/shared/CommentThread";

const QUICK_EMOJIS = ["👍", "👎", "❤️", "🎉", "🚀", "👀", "💯", "🙌"];

function formatShortDate(date: Date): string {
  const d = new Date(date);
  if (isToday(d)) return "just now";
  if (isYesterday(d)) return "yesterday";
  return format(d, "MMM d");
}

interface GoalActivityFeedProps {
  goalId: number;
  currentUserId?: string;
  items: GoalActivityItem[];
  onMutationSuccess: () => void;
}

export function GoalActivityFeed({
  goalId,
  currentUserId,
  items,
  onMutationSuccess,
}: GoalActivityFeedProps) {
  const deleteCommentMutation = api.goalComment.deleteComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const updateCommentMutation = api.goalComment.updateComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate({ commentId });
  };

  const handleEditComment = async (commentId: string, newContent: string) => {
    await updateCommentMutation.mutateAsync({
      commentId,
      content: newContent,
    });
  };

  if (items.length === 0) {
    return (
      <Text size="sm" className="text-text-muted py-8 text-center">
        No activity yet. Post an update or leave a comment to get started.
      </Text>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) =>
        item.type === "update" ? (
          <UpdateThread
            key={`update-${item.id}`}
            item={item}
            goalId={goalId}
            currentUserId={currentUserId}
            onMutationSuccess={onMutationSuccess}
          />
        ) : (
          <Card
            key={`comment-${item.id}`}
            withBorder
            radius="md"
            p={0}
            className="border-border-primary"
          >
            <CommentThread
              comments={[mapComment(item)]}
              variant="inline"
              emptyMessage={null}
              onDeleteComment={handleDeleteComment}
              onEditComment={handleEditComment}
              currentUserId={currentUserId}
            />
          </Card>
        ),
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function mapComment(item: GoalActivityComment): Comment {
  return {
    id: item.id,
    content: item.content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    author: item.author,
  };
}

// ── Shared Components ──────────────────────────────────────────

function AuthorAvatar({ author }: { author: { id: string; name: string | null; image: string | null } }) {
  const colorSeed = getColorSeed(author.name, null);
  const avatarBgColor = !author.image ? getAvatarColor(colorSeed) : undefined;
  const avatarTextColor = avatarBgColor ? getTextColor(avatarBgColor) : "white";
  const initial = getInitial(author.name, null);

  return (
    <Avatar
      src={author.image}
      size={24}
      radius="xl"
      styles={{
        root: {
          backgroundColor: avatarBgColor,
          color: avatarTextColor,
          fontWeight: 600,
          fontSize: "11px",
        },
      }}
    >
      {!author.image && initial}
    </Avatar>
  );
}

function EmojiPopover({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} shadow="md" radius="md">
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="gray"
          onClick={() => setOpened((o) => !o)}
          aria-label="Add reaction"
        >
          <IconMoodSmile size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <div className="grid grid-cols-4 gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-surface-hover transition-colors cursor-pointer"
              onClick={() => {
                onSelect(emoji);
                setOpened(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

// ── Update Thread (single card with replies) ───────────────────

function UpdateThread({
  item,
  goalId,
  currentUserId,
  onMutationSuccess,
}: {
  item: GoalActivityUpdate;
  goalId: number;
  currentUserId?: string;
  onMutationSuccess: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const healthKey = (item.health as HealthStatus) ?? "no-update";
  const health = healthConfig[healthKey] ?? healthConfig["no-update"];
  const HealthIcon = health.icon;
  const isOwn = currentUserId != null && item.author.id === currentUserId;
  const hasReplies = item.replies.length > 0;

  const deleteUpdateMutation = api.goalUpdate.deleteUpdate.useMutation({
    onSuccess: onMutationSuccess,
  });

  const deleteReplyMutation = api.goalComment.deleteComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const updateReplyMutation = api.goalComment.updateComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const addReplyMutation = api.goalComment.addComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const handleDeleteReply = (commentId: string) => {
    deleteReplyMutation.mutate({ commentId });
  };

  const handleEditReply = async (commentId: string, newContent: string) => {
    await updateReplyMutation.mutateAsync({
      commentId,
      content: newContent,
    });
  };

  const handleAddReply = async (content: string) => {
    await addReplyMutation.mutateAsync({
      goalId,
      content,
      parentUpdateId: item.id,
    });
  };

  const repliesAsComments: Comment[] = item.replies.map((reply) => ({
    id: reply.id,
    content: reply.content,
    createdAt: reply.createdAt,
    author: reply.author,
  }));

  return (
    <Card withBorder radius="md" p={0} className="border-border-primary">
      {/* Update header + content */}
      <div className="p-4">
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            <Group gap={4}>
              <HealthIcon size={16} style={{ color: health.color }} />
              <Text size="sm" fw={500} style={{ color: health.color }}>
                {health.label}
              </Text>
            </Group>
            <AuthorAvatar author={item.author} />
            <Text size="sm" className="text-text-secondary">
              {item.author.name ?? "Anonymous"}
            </Text>
            <Text size="xs" c="dimmed">
              {formatShortDate(item.createdAt)}
            </Text>
          </Group>

          {isOwn && (
            <Menu shadow="sm" position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="xs">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => deleteUpdateMutation.mutate({ updateId: item.id })}
                >
                  Delete update
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        <Text size="sm" className="text-text-primary" fw={500}>
          {item.content}
        </Text>

        {/* Action icons */}
        <Group gap="sm" mt="xs">
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            onClick={() => setShowReply((v) => !v)}
            aria-label="Reply"
          >
            <IconMessage size={16} />
          </ActionIcon>
          <EmojiPopover
            onSelect={(emoji) => {
              console.log("Reaction:", emoji, "on update", item.id);
            }}
          />
        </Group>
      </div>

      {/* Replies thread */}
      {hasReplies && (
        <div className="border-t border-border-primary">
          <CommentThread
            comments={repliesAsComments}
            variant="inline"
            emptyMessage={null}
            onDeleteComment={handleDeleteReply}
            onEditComment={handleEditReply}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* Reply input */}
      {(showReply || hasReplies) && (
        <div className="border-t border-border-primary px-4 py-3">
          <CommentInput
            onSubmit={handleAddReply}
            isSubmitting={addReplyMutation.isPending}
            placeholder="Leave a reply..."
          />
        </div>
      )}
    </Card>
  );
}
