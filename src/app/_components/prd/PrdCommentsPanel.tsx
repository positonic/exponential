"use client";

import { Badge, Paper, Stack, Text } from "@mantine/core";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import { CommentThread, type Comment } from "~/app/_components/shared/CommentThread";
import type {
  ThreadStatus,
  ReconcilableComment,
} from "~/lib/prd/thread-reconciliation";

export interface FeatureCommentRow extends ReconcilableComment {
  body: string;
  createdAt: string | Date;
  createdBy: { id: string; name: string | null; image: string | null };
}

/** The subset the panel renders — satisfied by a reconciled thread or a
 *  just-created pending thread that has no persisted comments yet. */
export interface PanelThread {
  threadId: string;
  status: ThreadStatus;
  quotedText: string | null;
  comments: FeatureCommentRow[];
}

interface PrdCommentsPanelProps {
  threads: PanelThread[];
  activeThreadId: string | null;
  pendingThreadId: string | null;
  onSelect: (threadId: string) => void;
  onSubmit: (threadId: string, body: string) => Promise<void>;
  currentUserId?: string;
  isSubmitting?: boolean;
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
 * Discussion panel for the PRD body (ADR-0024). Lists reconciled comment threads
 * — anchored (highlight live in the doc) and orphaned (anchor deleted, rendered
 * from `quotedText`) — and lets a member open one to read it and add a comment.
 * Replies, resolve/unresolve, and resolved-thread hiding land in the polish
 * slice; here a thread is its root comment(s).
 */
export function PrdCommentsPanel({
  threads,
  activeThreadId,
  pendingThreadId,
  onSelect,
  onSubmit,
  currentUserId,
  isSubmitting = false,
}: PrdCommentsPanelProps) {
  const visible = threads.filter((t) => t.status !== "resolved");

  return (
    <div>
      <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
        Discussion {visible.length > 0 ? `(${visible.length})` : ""}
      </Text>

      {visible.length === 0 && !pendingThreadId ? (
        <Text size="xs" className="text-text-muted">
          Select text in the body and choose Comment to start a thread.
        </Text>
      ) : (
        <Stack gap="sm">
          {visible.map((thread) => {
            const isActive =
              thread.threadId === activeThreadId ||
              thread.threadId === pendingThreadId;
            return (
              <Paper
                key={thread.threadId}
                withBorder
                radius="md"
                p="sm"
                className={`bg-surface-secondary cursor-pointer ${
                  isActive ? "border-border-focus" : ""
                }`}
                onClick={() => onSelect(thread.threadId)}
                data-thread-card={thread.threadId}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  {thread.quotedText ? (
                    <Text size="xs" className="text-text-muted italic truncate">
                      “{thread.quotedText}”
                    </Text>
                  ) : (
                    <span />
                  )}
                  {thread.status === "orphaned" && (
                    <Badge size="xs" variant="light" color="gray">
                      orphaned
                    </Badge>
                  )}
                </div>

                <CommentThread
                  comments={toThreadComments(thread.comments)}
                  currentUserId={currentUserId}
                  variant="inline"
                  emptyMessage={null}
                />

                {isActive && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <CommentInput
                      placeholder="Reply…"
                      isSubmitting={isSubmitting}
                      onSubmit={(body) => onSubmit(thread.threadId, body)}
                    />
                  </div>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
