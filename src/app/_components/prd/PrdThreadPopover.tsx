"use client";

import { useEffect, useRef } from "react";
import { ActionIcon, Button, Paper } from "@mantine/core";
import { IconCheck, IconArrowBackUp, IconX } from "@tabler/icons-react";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import { CommentThread, type Comment } from "~/app/_components/shared/CommentThread";
import type { FeatureCommentRow } from "~/app/_components/prd/PrdCommentsPanel";
import type { ThreadStatus } from "~/lib/prd/thread-reconciliation";

interface PrdThreadPopoverProps {
  threadId: string;
  quotedText: string | null;
  comments: FeatureCommentRow[];
  /** "pending" = a just-created thread with no persisted comments yet. */
  status: ThreadStatus | "pending";
  position: { top: number; left: number };
  onSubmit: (body: string) => Promise<void>;
  onResolve: () => void;
  onUnresolve: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

function toThreadComments(rows: FeatureCommentRow[]): Comment[] {
  return rows.map((row) => ({
    id: row.id,
    content: row.body,
    createdAt: new Date(row.createdAt),
    author: row.createdBy,
  }));
}

/**
 * Linear/Notion-style floating thread card, anchored directly beneath the
 * highlighted span (ADR-0024). Opening a thread — by selecting text and choosing
 * Comment, or by clicking an existing highlight — shows the discussion in place
 * so you write where you read; the same threads also appear in the Discussion
 * list at the bottom of the page.
 */
export function PrdThreadPopover({
  threadId,
  quotedText,
  comments,
  status,
  position,
  onSubmit,
  onResolve,
  onUnresolve,
  onClose,
  isSubmitting,
}: PrdThreadPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape (editor clicks on other highlights reopen
  // via the editor's own click handler, so this just dismisses stray clicks).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const root = comments.find((c) => !c.parentId);
  const rootRows = root ? [root] : [];
  const replyRows = comments.filter((c) => c.parentId);
  const isResolved = status === "resolved";
  const hasComments = comments.length > 0;

  return (
    <Paper
      ref={ref}
      withBorder
      shadow="md"
      radius="md"
      p="sm"
      data-thread-popover={threadId}
      className="bg-surface-secondary absolute z-50 w-[360px] max-w-[90vw]"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        {quotedText ? (
          <span className="text-text-muted text-xs italic truncate">
            “{quotedText}”
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1 shrink-0">
          {hasComments &&
            (isResolved ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconArrowBackUp size={13} />}
                onClick={onUnresolve}
              >
                Reopen
              </Button>
            ) : (
              <Button
                size="compact-xs"
                variant="subtle"
                color="teal"
                leftSection={<IconCheck size={13} />}
                onClick={onResolve}
              >
                Resolve
              </Button>
            ))}
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={onClose}
            aria-label="Close thread"
          >
            <IconX size={14} />
          </ActionIcon>
        </div>
      </div>

      {rootRows.length > 0 && (
        <CommentThread
          comments={toThreadComments(rootRows)}
          variant="inline"
          emptyMessage={null}
        />
      )}
      {replyRows.length > 0 && (
        <div className="mt-2 ml-3 border-l border-border-primary pl-3">
          <CommentThread
            comments={toThreadComments(replyRows)}
            variant="inline"
            emptyMessage={null}
          />
        </div>
      )}

      {!isResolved && (
        <div className="mt-2">
          <CommentInput
            placeholder={hasComments ? "Reply…" : "Comment…"}
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </Paper>
  );
}
