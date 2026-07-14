"use client";

import { ActionIcon, Avatar, Group, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentInput } from "~/app/_components/shared/CommentInput";

interface FeatureActivitySectionProps {
  featureId: string;
  /** Set to show a FeatureScope's feed instead of the feature's. */
  scopeId?: string;
}

/**
 * Comment feed for a feature or one of its scopes (Features V2) - the same
 * comment-card + composer pattern as the ticket detail page's Activity block.
 * Feature-level feed shows doc-level comments without a scope; a scope's feed
 * shows only its own. Anchored PRD-body comments (threadId set) stay inside
 * the PRD editor and never appear here.
 */
export function FeatureActivitySection({ featureId, scopeId }: FeatureActivitySectionProps) {
  const { data: session } = useSession();
  const utils = api.useUtils();

  const { data: comments } = api.product.featureComment.list.useQuery(
    { featureId },
    { enabled: !!featureId },
  );

  const invalidate = () => {
    void utils.product.featureComment.list.invalidate({ featureId });
  };

  const addComment = api.product.featureComment.create.useMutation({
    onSuccess: invalidate,
  });
  const deleteComment = api.product.featureComment.delete.useMutation({
    onSuccess: invalidate,
  });

  const feed = (comments ?? []).filter(
    (c) =>
      c.threadId == null &&
      c.parentId == null &&
      (scopeId ? c.scopeId === scopeId : c.scopeId == null),
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
                    <Avatar size="xs" radius="xl" src={c.createdBy.image}>
                      {(c.createdBy.name ?? "?")[0]?.toUpperCase()}
                    </Avatar>
                    <Text size="xs" fw={500} className="text-text-secondary">
                      {c.createdBy.name}
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </Text>
                  </Group>
                  <div className="ml-6">
                    <MarkdownRenderer content={c.body} />
                  </div>
                </div>
                {c.createdBy.id === session?.user?.id && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => deleteComment.mutate({ commentId: c.id })}
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
        isSubmitting={addComment.isPending}
        onSubmit={async (content) => {
          await addComment.mutateAsync({ featureId, scopeId, body: content });
        }}
      />
    </div>
  );
}
