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
import { CommentThread } from "~/app/_components/shared/CommentThread";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { Comment } from "~/app/_components/shared/CommentThread";
import type {
  ActivityItem,
  ActivityUpdate,
  ActivityComment,
  ActivityEventItem,
  ActivityFilter,
  StatusOption,
} from "./activityTypes";

const QUICK_EMOJIS = ["👍", "👎", "❤️", "🎉", "🚀", "👀", "💯", "🙌"];

function formatShortDate(date: Date): string {
  const d = new Date(date);
  if (isToday(d)) return "just now";
  if (isYesterday(d)) return "yesterday";
  return format(d, "MMM d");
}

interface ActivityFeedProps {
  items: ActivityItem[];
  currentUserId?: string;
  /** Timeline filter (unified timeline surfaces). Default: everything. */
  filter?: ActivityFilter;

  onDeleteComment: (id: string) => void;
  onEditComment: (id: string, content: string) => Promise<void>;
  onDeleteImage?: (commentId: string, imageUrl: string) => void;

  onDeleteUpdate?: (id: string) => void;
  onAddReply?: (updateId: string, content: string) => Promise<void>;
  onDeleteReply?: (id: string) => void;
  onEditReply?: (id: string, content: string) => Promise<void>;

  statusOptions?: StatusOption[];
  mentionNames?: string[];
  emptyMessage?: string;
}

export function ActivityFeed({
  items,
  currentUserId,
  filter = "all",
  onDeleteComment,
  onEditComment,
  onDeleteImage,
  onDeleteUpdate,
  onAddReply,
  onDeleteReply,
  onEditReply,
  statusOptions,
  mentionNames,
  emptyMessage = "No activity yet. Post an update or leave a comment to get started.",
}: ActivityFeedProps) {
  const visible =
    filter === "all"
      ? items
      : items.filter((item) =>
          filter === "changes" ? item.type === "event" : item.type !== "event",
        );

  if (visible.length === 0) {
    return (
      <Text size="sm" className="text-text-muted py-8 text-center">
        {filter === "changes" ? "No changes recorded yet." : emptyMessage}
      </Text>
    );
  }

  return (
    <div className="space-y-4">
      {visible.map((item) =>
        item.type === "event" ? (
          <EventRow key={`event-${item.id}`} item={item} />
        ) : item.type === "update" ? (
          <UpdateThread
            key={`update-${item.id}`}
            item={item}
            currentUserId={currentUserId}
            onDeleteUpdate={onDeleteUpdate}
            onAddReply={onAddReply}
            onDeleteReply={onDeleteReply}
            onEditReply={onEditReply}
            statusOptions={statusOptions}
            mentionNames={mentionNames}
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
              onDeleteComment={onDeleteComment}
              onEditComment={onEditComment}
              onDeleteImage={onDeleteImage}
              currentUserId={currentUserId}
              mentionNames={mentionNames}
            />
          </Card>
        ),
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function mapComment(item: ActivityComment): Comment {
  return {
    id: item.id,
    content: item.content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    author: item.author,
  };
}

// ── Event row (unified timeline) ──────────────────────────────
// One quiet line between comment cards: dot, actor, verb phrase, optional
// from→to status tokens, relative time (absolute on hover). No card, no
// avatar - events are subordinate to authored content.

function StatusToken({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full self-center"
        style={{ backgroundColor: `var(--mantine-color-${color}-6)` }}
      />
      <span className="text-text-secondary">{label}</span>
    </span>
  );
}

function EventRow({ item }: { item: ActivityEventItem }) {
  const absolute = new Date(item.createdAt).toLocaleString();
  return (
    <div className="flex items-start gap-2 px-1 text-xs text-text-muted leading-5">
      <span
        className="mt-2 inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{
          backgroundColor: item.statusChange
            ? `var(--mantine-color-${item.statusChange.toColor}-6)`
            : "var(--color-border-primary)",
        }}
      />
      <span className="min-w-0">
        <span className="font-medium text-text-secondary">{item.actorName}</span>{" "}
        {item.text}
        {item.statusChange && (
          <>
            {" "}
            <StatusToken label={item.statusChange.fromLabel} color={item.statusChange.fromColor} />
            <span className="mx-1">→</span>
            <StatusToken label={item.statusChange.toLabel} color={item.statusChange.toColor} />
          </>
        )}
        {item.bulk && <span className="opacity-70"> via bulk edit</span>}
        <span title={absolute}> · {formatShortDate(item.createdAt)}</span>
      </span>
    </div>
  );
}

// ── Shared Sub-Components ─────────────────────────────────────

function AuthorAvatar({
  author,
}: {
  author: { id: string; name: string | null; image: string | null };
}) {
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

function EmojiPopover({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
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

// ── Update Thread ─────────────────────────────────────────────

function UpdateThread({
  item,
  currentUserId,
  onDeleteUpdate,
  onAddReply,
  onDeleteReply,
  onEditReply,
  statusOptions,
  mentionNames,
}: {
  item: ActivityUpdate;
  currentUserId?: string;
  onDeleteUpdate?: (id: string) => void;
  onAddReply?: (updateId: string, content: string) => Promise<void>;
  onDeleteReply?: (id: string) => void;
  onEditReply?: (id: string, content: string) => Promise<void>;
  statusOptions?: StatusOption[];
  mentionNames?: string[];
}) {
  const [showReply, setShowReply] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const isOwn = currentUserId != null && item.author.id === currentUserId;
  const hasReplies = item.replies.length > 0;

  const statusConfig = statusOptions?.find((s) => s.key === item.status);
  const StatusIcon = statusConfig?.icon;

  const handleAddReply = async (content: string) => {
    if (!onAddReply) return;
    setIsSubmittingReply(true);
    try {
      await onAddReply(item.id, content);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const repliesAsComments: Comment[] = item.replies.map((reply) => ({
    id: reply.id,
    content: reply.content,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
    author: reply.author,
  }));

  return (
    <Card withBorder radius="md" p={0} className="border-border-primary">
      {/* Update header + content */}
      <div className="p-4">
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            {statusConfig && StatusIcon && (
              <Group gap={4}>
                <StatusIcon
                  size={16}
                  style={{ color: statusConfig.color }}
                />
                <Text
                  size="sm"
                  fw={500}
                  style={{ color: statusConfig.color }}
                >
                  {statusConfig.label}
                </Text>
              </Group>
            )}
            <AuthorAvatar author={item.author} />
            <Text size="sm" className="text-text-secondary">
              {item.author.name ?? "Anonymous"}
            </Text>
            <Text size="xs" c="dimmed">
              {formatShortDate(item.createdAt)}
            </Text>
          </Group>

          {isOwn && onDeleteUpdate && (
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
                  onClick={() => onDeleteUpdate(item.id)}
                >
                  Delete update
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        <MarkdownRenderer content={item.content} variant="compact" mentionNames={mentionNames} />

        {/* Action icons */}
        <Group gap="sm" mt="xs">
          {onAddReply && (
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => setShowReply((v) => !v)}
              aria-label="Reply"
            >
              <IconMessage size={16} />
            </ActionIcon>
          )}
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
            onDeleteComment={onDeleteReply}
            onEditComment={onEditReply}
            currentUserId={currentUserId}
            mentionNames={mentionNames}
          />
        </div>
      )}

      {/* Reply input */}
      {onAddReply && (showReply || hasReplies) && (
        <div className="border-t border-border-primary px-4 py-3">
          <CommentInput
            onSubmit={handleAddReply}
            isSubmitting={isSubmittingReply}
            placeholder="Leave a reply..."
          />
        </div>
      )}
    </Card>
  );
}
