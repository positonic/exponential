"use client";

import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button, Menu, Paper, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconArrowBackUp,
  IconDots,
  IconPencil,
  IconTrash,
  IconCopy,
  IconLink,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import type { FeatureCommentRow } from "~/app/_components/prd/PrdCommentsPanel";
import type { ThreadStatus } from "~/lib/prd/thread-reconciliation";

interface PrdThreadPopoverProps {
  threadId: string;
  comments: FeatureCommentRow[];
  /** "pending" = a just-created thread with no persisted comments yet. */
  status: ThreadStatus | "pending";
  position: { top: number; left: number };
  currentUserId?: string;
  onSubmit: (body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  onResolve: () => void;
  onUnresolve: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

function Avatar({ name }: { name: string | null }) {
  const seed = getColorSeed(name, null);
  const bg = getAvatarColor(seed);
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color: getTextColor(bg) }}
    >
      {getInitial(name)}
    </div>
  );
}

/**
 * Linear/Notion-style floating thread card, anchored directly beneath the
 * highlighted span (ADR-0024). Matches Linear's card chrome: per-comment
 * avatar + author + relative time, a thread-level resolve check, and a `⋯`
 * overflow menu (edit / resolve / copy / delete), with a reply composer at the
 * foot. The same threads also appear in the Discussion list at the page foot.
 */
export function PrdThreadPopover({
  threadId,
  comments,
  status,
  position,
  currentUserId,
  onSubmit,
  onEdit,
  onDelete,
  onResolve,
  onUnresolve,
  onClose,
  isSubmitting,
}: PrdThreadPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Close on outside click / Escape. Ignore clicks inside the card or inside a
  // portalled Mantine menu (role="menu"), which live outside the card's DOM.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      if (target.closest('[role="menu"]')) return;
      onClose();
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

  const ordered = [
    ...comments.filter((c) => !c.parentId),
    ...comments.filter((c) => c.parentId),
  ];
  const isResolved = status === "resolved";
  const hasComments = comments.length > 0;

  const copy = (text: string, message: string) => {
    void navigator.clipboard?.writeText(text);
    notifications.show({ message, color: "gray" });
  };

  const startEdit = (c: FeatureCommentRow) => {
    setEditingId(c.id);
    setEditValue(c.body);
  };

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return;
    setSavingEdit(true);
    try {
      await onEdit(editingId, editValue.trim());
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Paper
      ref={ref}
      withBorder
      shadow="md"
      radius="md"
      data-thread-popover={threadId}
      className="bg-surface-secondary absolute z-50 w-[380px] max-w-[90vw] overflow-hidden"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {ordered.map((c, i) => {
        const isRoot = !c.parentId;
        const isOwn = currentUserId != null && c.createdBy.id === currentUserId;
        return (
          <div
            key={c.id}
            className={`group px-3 py-2.5 ${i > 0 ? "border-t border-border-primary" : ""}`}
          >
            <div className="flex items-center gap-2">
              <Avatar name={c.createdBy.name} />
              <span className="text-text-primary text-sm font-medium">
                {c.createdBy.name ?? "Unknown"}
              </span>
              <span className="text-text-muted text-xs">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </span>
              <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {isRoot &&
                  (isResolved ? (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      title="Reopen thread"
                      aria-label="Reopen thread"
                      onClick={onUnresolve}
                    >
                      <IconArrowBackUp size={15} />
                    </ActionIcon>
                  ) : (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="teal"
                      title="Resolve thread"
                      aria-label="Resolve thread"
                      onClick={onResolve}
                    >
                      <IconCheck size={15} />
                    </ActionIcon>
                  ))}
                <Menu position="bottom-end" withinPortal shadow="md">
                  <Menu.Target>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      aria-label="Comment actions"
                    >
                      <IconDots size={15} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {isOwn && (
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => startEdit(c)}
                      >
                        Edit
                      </Menu.Item>
                    )}
                    {isRoot &&
                      (isResolved ? (
                        <Menu.Item
                          leftSection={<IconArrowBackUp size={14} />}
                          onClick={onUnresolve}
                        >
                          Reopen thread
                        </Menu.Item>
                      ) : (
                        <Menu.Item
                          leftSection={<IconCheck size={14} />}
                          onClick={onResolve}
                        >
                          Resolve thread
                        </Menu.Item>
                      ))}
                    <Menu.Item
                      leftSection={<IconCopy size={14} />}
                      onClick={() => copy(c.body, "Copied as Markdown")}
                    >
                      Copy content as Markdown
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconLink size={14} />}
                      onClick={() =>
                        copy(
                          `${window.location.origin}${window.location.pathname}#thread-${threadId}`,
                          "Link copied",
                        )
                      }
                    >
                      Copy link to comment
                    </Menu.Item>
                    {isOwn && (
                      <>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => onDelete(c.id)}
                        >
                          Delete
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>

            <div className="mt-1 pl-8">
              {editingId === c.id ? (
                <div>
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.currentTarget.value)}
                    autosize
                    minRows={2}
                    size="sm"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="compact-xs"
                      onClick={() => void saveEdit()}
                      loading={savingEdit}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <MarkdownRenderer content={c.body} variant="compact" />
              )}
            </div>
          </div>
        );
      })}

      {!isResolved && (
        <div className="border-t border-border-primary px-3 py-2">
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
