"use client";

import { useMemo } from "react";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import { CommentThread, type Comment } from "~/app/_components/shared/CommentThread";
import { CommentInput } from "~/app/_components/shared/CommentInput";

interface CommentSectionProps {
  comments: Comment[];
  currentUserId?: string;
  mentionCandidates?: MentionCandidate[];
  isSubmitting?: boolean;
  placeholder?: string;
  /** Shown when there are no comments; null hides the empty state entirely. */
  emptyMessage?: string | null;
  /** Hide the composer (e.g. read-only viewers). The thread still renders. */
  canComment?: boolean;
  onSubmit: (content: string) => Promise<void>;
  onEdit?: (commentId: string, content: string) => Promise<void>;
  onDelete?: (commentId: string) => void;
}

/**
 * The reusable flat comment feed: a CommentThread card list over a
 * CommentInput composer, wired for @mentions. Entity-specific wrappers
 * (feature activity, page comments, …) own their tRPC queries/mutations and
 * map rows into {@link Comment}; everything visual lives here so new comment
 * surfaces don't re-implement the card.
 */
export function CommentSection({
  comments,
  currentUserId,
  mentionCandidates,
  isSubmitting = false,
  placeholder = "Leave a comment...",
  emptyMessage = null,
  canComment = true,
  onSubmit,
  onEdit,
  onDelete,
}: CommentSectionProps) {
  const mentionNames = useMemo(
    () => mentionCandidates?.map((c) => c.name),
    [mentionCandidates],
  );

  return (
    <div>
      <CommentThread
        comments={comments}
        currentUserId={currentUserId}
        mentionNames={mentionNames}
        emptyMessage={emptyMessage}
        onEditComment={onEdit}
        onDeleteComment={onDelete}
      />
      {canComment && (
        <CommentInput
          placeholder={placeholder}
          isSubmitting={isSubmitting}
          mentionCandidates={mentionCandidates}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}
