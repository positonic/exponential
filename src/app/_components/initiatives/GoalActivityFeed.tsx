"use client";

import { useState } from "react";
import {
  Text,
  Avatar,
  ActionIcon,
  Group,
  Badge,
  Textarea,
  Button,
  Card,
} from "@mantine/core";
import {
  IconTrash,
  IconPencil,
  IconMessage,
  IconMoodSmile,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
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

interface GoalActivityFeedProps {
  currentUserId?: string;
  items: GoalActivityItem[];
  onMutationSuccess: () => void;
}

export function GoalActivityFeed({
  currentUserId,
  items,
  onMutationSuccess,
}: GoalActivityFeedProps) {
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
          <UpdateItem
            key={`update-${item.id}`}
            item={item}
            currentUserId={currentUserId}
            onMutationSuccess={onMutationSuccess}
          />
        ) : (
          <CommentItem
            key={`comment-${item.id}`}
            item={item}
            currentUserId={currentUserId}
            onMutationSuccess={onMutationSuccess}
          />
        ),
      )}
    </div>
  );
}

function UpdateItem({
  item,
  currentUserId,
  onMutationSuccess,
}: {
  item: GoalActivityUpdate;
  currentUserId?: string;
  onMutationSuccess: () => void;
}) {
  const healthKey = (item.health as HealthStatus) ?? "no-update";
  const health = healthConfig[healthKey] ?? healthConfig["no-update"];
  const HealthIcon = health.icon;
  const author = item.author;
  const colorSeed = getColorSeed(author.name, null);
  const avatarBgColor = !author.image ? getAvatarColor(colorSeed) : undefined;
  const avatarTextColor = avatarBgColor ? getTextColor(avatarBgColor) : "white";
  const initial = getInitial(author.name, null);
  const isOwn = currentUserId != null && author.id === currentUserId;

  const deleteUpdateMutation = api.goalUpdate.deleteUpdate.useMutation({
    onSuccess: onMutationSuccess,
  });

  return (
    <Card withBorder radius="md" p="md" className="group border-border-primary">
      <Group gap="sm" mb="sm">
        <Badge
          variant="filled"
          color={health.mantineColor}
          leftSection={<HealthIcon size={12} />}
          size="sm"
        >
          {health.label}
        </Badge>
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
        <Text size="sm" className="text-text-secondary">
          {author.name ?? "Anonymous"}
        </Text>
        <Text size="xs" c="dimmed">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </Text>

        {isOwn && (
          <ActionIcon
            variant="subtle"
            color="red"
            size="xs"
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => deleteUpdateMutation.mutate({ updateId: item.id })}
            aria-label="Delete update"
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>

      <Text size="sm" className="text-text-primary">
        {item.content}
      </Text>

      <Group gap="sm" mt="xs">
        <ActionIcon variant="subtle" size="sm" color="gray">
          <IconMessage size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" color="gray">
          <IconMoodSmile size={16} />
        </ActionIcon>
      </Group>
    </Card>
  );
}

function CommentItem({
  item,
  currentUserId,
  onMutationSuccess,
}: {
  item: GoalActivityComment;
  currentUserId?: string;
  onMutationSuccess: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  const author = item.author;
  const colorSeed = getColorSeed(author.name, null);
  const avatarBgColor = !author.image ? getAvatarColor(colorSeed) : undefined;
  const avatarTextColor = avatarBgColor ? getTextColor(avatarBgColor) : "white";
  const initial = getInitial(author.name, null);
  const isOwn = currentUserId != null && author.id === currentUserId;
  const isEdited =
    item.updatedAt &&
    new Date(item.updatedAt).getTime() > new Date(item.createdAt).getTime() + 1000;

  const deleteCommentMutation = api.goalComment.deleteComment.useMutation({
    onSuccess: onMutationSuccess,
  });

  const updateCommentMutation = api.goalComment.updateComment.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      setEditContent("");
      onMutationSuccess();
    },
  });

  const startEditing = () => {
    setIsEditing(true);
    setEditContent(item.content);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditContent("");
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (editContent.trim()) {
        updateCommentMutation.mutate({
          commentId: item.id,
          content: editContent.trim(),
        });
      }
    }
  };

  return (
    <Card withBorder radius="md" p="md" className="group border-border-primary">
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
                {formatDistanceToNow(new Date(item.createdAt), {
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
                  disabled={updateCommentMutation.isPending}
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
                    onClick={() =>
                      updateCommentMutation.mutate({
                        commentId: item.id,
                        content: editContent.trim(),
                      })
                    }
                    loading={updateCommentMutation.isPending}
                    disabled={!editContent.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setIsEditing(false);
                      setEditContent("");
                    }}
                    disabled={updateCommentMutation.isPending}
                  >
                    Cancel
                  </Button>
                </Group>
              </div>
            ) : (
              <Text size="sm" className="text-text-secondary">
                {item.content}
              </Text>
            )}
          </div>
        </Group>

        {isOwn && !isEditing && (
          <Group
            gap={4}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={startEditing}
              aria-label="Edit comment"
            >
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size="xs"
              onClick={() =>
                deleteCommentMutation.mutate({ commentId: item.id })
              }
              aria-label="Delete comment"
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        )}
      </Group>
    </Card>
  );
}
