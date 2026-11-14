"use client";

import { useRef, useState } from "react";
import { ActionIcon, Avatar } from "@mantine/core";
import { IconAt } from "@tabler/icons-react";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

interface InlineCommentComposerProps {
  onSubmit: (content: string) => Promise<void>;
  mentionCandidates?: MentionCandidate[];
  placeholder?: string;
  /** The signed-in author, for the avatar on the collapsed row. */
  author?: { name?: string | null; image?: string | null } | null;
}

/**
 * The quiet comment affordance under a document: a single row — avatar,
 * muted "Add a comment…" and an @ — that opens into the full Markdown
 * {@link CommentInput} on click, and folds back once the comment is sent or
 * the empty editor loses focus. Keeps a long page's tail calm without
 * hiding the way in.
 */
export function InlineCommentComposer({
  onSubmit,
  mentionCandidates,
  placeholder = "Add a comment…",
  author,
}: InlineCommentComposerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const avatar = (
    <Avatar src={author?.image ?? undefined} size={24} radius="xl" alt="">
      {author?.name?.trim().charAt(0).toUpperCase() ?? ""}
    </Avatar>
  );

  if (!open) {
    return (
      <div className="mt-3 flex items-center gap-3" data-testid="inline-comment-composer">
        {avatar}
        <button
          type="button"
          className="min-w-0 flex-1 py-1.5 text-left text-sm text-text-muted hover:text-text-secondary"
          onClick={() => setOpen(true)}
        >
          {placeholder}
        </button>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Mention someone"
          onClick={() => setOpen(true)}
        >
          <IconAt size={16} />
        </ActionIcon>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="mt-3 flex items-start gap-3"
      data-testid="inline-comment-composer"
      onBlur={(e) => {
        const wrapper = wrapperRef.current;
        if (!wrapper || wrapper.contains(e.relatedTarget as Node | null)) return;
        // Fold back only when nothing has been typed — a half-written
        // comment must survive a stray click elsewhere.
        const textarea = wrapper.querySelector("textarea");
        if (!textarea?.value.trim()) setOpen(false);
      }}
    >
      <div className="pt-2">{avatar}</div>
      <div className="min-w-0 flex-1">
        <CommentInput
          autoFocus
          onSubmit={async (content) => {
            await onSubmit(content);
            setOpen(false);
          }}
          placeholder={placeholder}
          mentionCandidates={mentionCandidates}
        />
      </div>
    </div>
  );
}
