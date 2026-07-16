"use client";

import { Text } from "@mantine/core";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { useWorkspaceMentionCandidates } from "~/hooks/useWorkspaceMentionCandidates";
import { CommentSection } from "~/app/_components/shared/CommentSection";

/**
 * Comment feed under a Knowledge Page body — the shared CommentSection card
 * base over the pageComment router. View access is the commenting gate
 * (server-enforced), so the composer shows for everyone who can open the page.
 */
export function PageCommentsSection({ pageId }: { pageId: string }) {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const mentionCandidates = useWorkspaceMentionCandidates();

  const { data: comments } = api.pageComment.list.useQuery(
    { pageId },
    { enabled: !!pageId },
  );

  const invalidate = () => {
    void utils.pageComment.list.invalidate({ pageId });
  };

  const addComment = api.pageComment.create.useMutation({ onSuccess: invalidate });
  const updateComment = api.pageComment.update.useMutation({ onSuccess: invalidate });
  const deleteComment = api.pageComment.delete.useMutation({ onSuccess: invalidate });

  return (
    <div className="mt-10 border-t border-border-primary pt-6">
      <Text size="sm" fw={600} className="text-text-primary" mb="sm">
        Comments
      </Text>
      <CommentSection
        comments={(comments ?? []).map((c) => ({
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
          await addComment.mutateAsync({ pageId, body: content });
        }}
        onEdit={async (commentId, content) => {
          await updateComment.mutateAsync({ commentId, body: content });
        }}
        onDelete={(commentId) => deleteComment.mutate({ commentId })}
      />
    </div>
  );
}
