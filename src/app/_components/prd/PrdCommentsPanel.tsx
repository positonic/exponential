"use client";

import { useState } from "react";
import { Badge, Button, Paper, Stack, Text } from "@mantine/core";
import { IconCheck, IconArrowBackUp } from "@tabler/icons-react";
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
  onResolve: (threadId: string) => Promise<void>;
  onUnresolve: (threadId: string) => Promise<void>;
  /** Whether the list owns the composer (false while the anchored popover does). */
  composerActive?: boolean;
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
 * Discussion panel for the PRD body (ADR-0024). Lists reconciled threads —
 * anchored, orphaned (rendered from `quotedText`), and resolved — with threaded
 * replies and resolve/unresolve. Resolved threads are hidden behind a toggle and
 * never deleted, so a settled discussion stays out of the way but is always
 * retrievable and reopenable.
 */
export function PrdCommentsPanel({
  threads,
  activeThreadId,
  pendingThreadId,
  onSelect,
  onSubmit,
  onResolve,
  onUnresolve,
  composerActive = true,
  currentUserId,
  isSubmitting = false,
}: PrdCommentsPanelProps) {
  const [showResolved, setShowResolved] = useState(false);

  const open = threads.filter((t) => t.status !== "resolved");
  const resolved = threads.filter((t) => t.status === "resolved");
  const visible = showResolved ? [...open, ...resolved] : open;

  const renderThread = (thread: PanelThread) => {
    const isResolved = thread.status === "resolved";
    const isActive =
      thread.threadId === activeThreadId || thread.threadId === pendingThreadId;
    const root = thread.comments.find((c) => !c.parentId);
    const rootRows = root ? [root] : [];
    const replyRows = thread.comments.filter((c) => c.parentId);

    return (
      <Paper
        key={thread.threadId}
        withBorder
        radius="md"
        p="sm"
        className={`bg-surface-secondary cursor-pointer ${
          isActive ? "border-border-focus" : ""
        } ${isResolved ? "opacity-70" : ""}`}
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
          <div className="flex items-center gap-1 shrink-0">
            {thread.status === "orphaned" && (
              <Badge size="xs" variant="light" color="gray">
                orphaned
              </Badge>
            )}
            {isResolved ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconArrowBackUp size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  void onUnresolve(thread.threadId);
                }}
              >
                Reopen
              </Button>
            ) : (
              <Button
                size="compact-xs"
                variant="subtle"
                color="teal"
                leftSection={<IconCheck size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  void onResolve(thread.threadId);
                }}
              >
                Resolve
              </Button>
            )}
          </div>
        </div>

        <CommentThread
          comments={toThreadComments(rootRows)}
          currentUserId={currentUserId}
          variant="inline"
          emptyMessage={null}
        />

        {replyRows.length > 0 && (
          <div className="mt-2 ml-3 border-l border-border-primary pl-3">
            <CommentThread
              comments={toThreadComments(replyRows)}
              currentUserId={currentUserId}
              variant="inline"
              emptyMessage={null}
            />
          </div>
        )}

        {isActive && !isResolved && composerActive && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <CommentInput
              placeholder={rootRows.length === 0 ? "Comment…" : "Reply…"}
              isSubmitting={isSubmitting}
              onSubmit={(body) => onSubmit(thread.threadId, body)}
            />
          </div>
        )}
      </Paper>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
          Discussion {open.length > 0 ? `(${open.length})` : ""}
        </Text>
        {resolved.length > 0 && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setShowResolved((s) => !s)}
          >
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </Button>
        )}
      </div>

      {visible.length === 0 && !pendingThreadId ? (
        <Text size="xs" className="text-text-muted">
          Select text in the body and choose Comment to start a thread.
        </Text>
      ) : (
        <Stack gap="sm">{visible.map(renderThread)}</Stack>
      )}
    </div>
  );
}
