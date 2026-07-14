"use client";

import { ActionIcon, Avatar, Group, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentInput } from "~/app/_components/shared/CommentInput";

/** Normalized comment shape rendered by {@link ActivitySection}. */
export interface ActivityComment {
  id: string;
  author: { id: string; name: string | null; image: string | null };
  createdAt: Date | string;
  /** Markdown body (ADR-0017). */
  content: string;
}

interface ActivitySectionProps {
  comments: ActivityComment[];
  /** Delete affordance is shown only on the current user's own comments
   * (matching the server's author-only delete rule). */
  currentUserId?: string;
  onDelete: (commentId: string) => void;
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * THE canonical Activity block for detail pages (ticket, feature, scope):
 * comment cards + Markdown composer. Presentational - callers own the data
 * fetching/mutations and map their comment rows to {@link ActivityComment}.
 * Pages wrap it in `CollapsibleSection title="Activity"` for the standard
 * chevron + uppercase header. Change it here and every detail page follows.
 */
export function ActivitySection({
  comments,
  currentUserId,
  onDelete,
  onSubmit,
  isSubmitting = false,
}: ActivitySectionProps) {
  // Ordering is component-owned so every page reads the same: oldest first,
  // newest next to the composer (callers pass comments in any order).
  const feed = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return (
    <div>
      {feed.length > 0 && (
        <Stack gap="sm" mb="md">
          {feed.map((c) => (
            <div key={c.id} className="border border-border-primary rounded-lg p-3">
              <Group justify="space-between" align="flex-start">
                <div className="flex-1">
                  <Group gap="xs" mb={4}>
                    <Avatar size="xs" radius="xl" src={c.author.image}>
                      {(c.author.name ?? "?")[0]?.toUpperCase()}
                    </Avatar>
                    <Text size="xs" fw={500} className="text-text-secondary">
                      {c.author.name}
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </Text>
                  </Group>
                  <div className="ml-6">
                    <MarkdownRenderer content={c.content} />
                  </div>
                </div>
                {c.author.id === currentUserId && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => onDelete(c.id)}
                    aria-label="Delete comment"
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                )}
              </Group>
            </div>
          ))}
        </Stack>
      )}

      <CommentInput
        placeholder="Leave a comment..."
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
      />
    </div>
  );
}
