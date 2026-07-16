"use client";

import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { useWorkspaceMentionCandidates } from "~/hooks/useWorkspaceMentionCandidates";
import { CommentSection } from "~/app/_components/shared/CommentSection";

interface FeatureActivitySectionProps {
  featureId: string;
  /** Set to show a FeatureScope's feed instead of the feature's. */
  scopeId?: string;
}

/**
 * Comment feed for a feature or one of its scopes (Features V2) — the shared
 * CommentSection card base over the featureComment router. Feature-level feed
 * shows doc-level comments without a scope; a scope's feed shows only its own.
 * Anchored PRD-body comments (threadId set) stay inside the PRD editor and
 * never appear here.
 */
export function FeatureActivitySection({ featureId, scopeId }: FeatureActivitySectionProps) {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const mentionCandidates = useWorkspaceMentionCandidates();

  const { data: comments } = api.product.featureComment.list.useQuery({
    featureId,
  });

  const invalidate = () => {
    void utils.product.featureComment.list.invalidate({ featureId });
  };

  const addComment = api.product.featureComment.create.useMutation({
    onSuccess: invalidate,
  });
  const updateComment = api.product.featureComment.update.useMutation({
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
    <CommentSection
      comments={feed.map((c) => ({
        id: c.id,
        content: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: c.createdBy,
      }))}
      currentUserId={session?.user?.id}
      mentionCandidates={mentionCandidates}
      isSubmitting={addComment.isPending}
      onSubmit={async (content) => {
        await addComment.mutateAsync({ featureId, scopeId, body: content });
      }}
      onEdit={async (commentId, content) => {
        await updateComment.mutateAsync({ commentId, body: content });
      }}
      onDelete={(commentId) => deleteComment.mutate({ commentId })}
    />
  );
}
