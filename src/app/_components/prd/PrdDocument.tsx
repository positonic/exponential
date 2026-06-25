"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Stack } from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import { notifications } from "@mantine/notifications";
import { IconMessagePlus } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { reconcileThreads } from "~/lib/prd/thread-reconciliation";
import {
  CommentResolution,
  setResolvedThreadIds,
} from "~/lib/prd/comment-resolution";
import {
  RichDocEditor,
  type RichDocEditorHandle,
} from "~/app/_components/shared/RichDocEditor";
import {
  PrdCommentsPanel,
  type FeatureCommentRow,
  type PanelThread,
} from "~/app/_components/prd/PrdCommentsPanel";
import { PrdThreadPopover } from "~/app/_components/prd/PrdThreadPopover";

interface AnchorPos {
  top: number;
  left: number;
}
const POPOVER_WIDTH = 360;

interface PrdDocumentProps {
  featureId: string;
  /** Canonical ProseMirror document; null until the feature is first migrated. */
  descriptionDoc: JSONContent | null;
  /** Legacy/derived Markdown projection — source of the one-time migration. */
  description: string | null;
  /** Stored doc version, the base for the optimistic-concurrency check. */
  docVersion?: number;
  /** Workspace members edit in place; everyone else gets a read-only render. */
  editable?: boolean;
  /** Show the anchored-comments affordances + discussion panel. */
  enableComments?: boolean;
}

function newThreadId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `thread-${Date.now()}-${Math.round(performance.now())}`;
}

/**
 * The **PRD body** editor (ADR-0024): the shared {@link RichDocEditor} engine
 * wired to the Feature `descriptionDoc`/`description`/`docVersion` storage, plus
 * the Feature-specific anchored-comments layer. With `enableComments`, a member
 * can select text and pin a comment thread to it via a `comment` mark; the
 * highlight stays glued to the words via ProseMirror position mapping, and the
 * discussion panel lists reconciled threads (anchored vs orphaned).
 */
export function PrdDocument({
  featureId,
  descriptionDoc,
  description,
  docVersion = 0,
  editable = false,
  enableComments = false,
}: PrdDocumentProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const flushSaveRef = useRef<() => void>(() => undefined);

  // Bumped on every doc change so thread reconciliation re-reads the live marks.
  const [docTick, setDocTick] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ threadId: string; quotedText: string } | null>(null);
  // When set, the active thread shows as a popover anchored under its highlight;
  // when null, the active thread's composer lives in the bottom Discussion list.
  const [anchorPos, setAnchorPos] = useState<AnchorPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Position (relative to the editor wrapper) just below a doc range, so a
  // thread popover sits directly under the highlighted text (Linear-style).
  const computeAnchor = (
    view: EditorView,
    fromPos: number,
    toPos: number,
  ): AnchorPos | null => {
    const wrap = wrapperRef.current;
    if (!wrap) return null;
    const start = view.coordsAtPos(fromPos);
    const end = view.coordsAtPos(toPos);
    const rect = wrap.getBoundingClientRect();
    const maxLeft = Math.max(0, wrap.clientWidth - POPOVER_WIDTH);
    const left = Math.min(Math.max(0, start.left - rect.left), maxLeft);
    const top = Math.max(start.bottom, end.bottom) - rect.top + 6;
    return { top, left };
  };

  const closeThread = () => {
    setActiveThreadId(null);
    setAnchorPos(null);
  };

  const utils = api.useUtils();
  const initDescriptionDoc = api.product.feature.initDescriptionDoc.useMutation();
  const updateFeature = api.product.feature.update.useMutation();
  const uploadImageMutation = api.product.feature.uploadImage.useMutation();
  const createComment = api.product.featureComment.create.useMutation();
  const replyComment = api.product.featureComment.reply.useMutation();
  const updateComment = api.product.featureComment.update.useMutation();
  const deleteComment = api.product.featureComment.delete.useMutation();
  const resolveThread = api.product.featureComment.resolve.useMutation();
  const unresolveThread = api.product.featureComment.unresolve.useMutation();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const commentsQuery = api.product.featureComment.list.useQuery(
    { featureId },
    { enabled: enableComments },
  );
  const comments = useMemo(
    () => (commentsQuery.data ?? []) as FeatureCommentRow[],
    [commentsQuery.data],
  );

  const handleReady = (handle: RichDocEditorHandle) => {
    setEditor(handle.editor);
    flushSaveRef.current = handle.flushSave;
  };

  // Push the set of resolved threads to the editor so their highlights hide.
  useEffect(() => {
    if (!editor || !enableComments) return;
    const resolved = new Set(
      comments
        .filter((c) => !c.parentId && c.resolvedAt != null)
        .map((c) => c.threadId)
        .filter((t): t is string => !!t),
    );
    setResolvedThreadIds(editor, resolved);
  }, [editor, comments, enableComments]);

  // Reconcile threads against the live document; include a pending (just-created,
  // not-yet-saved) thread so its composer shows immediately.
  const panelThreads: PanelThread[] = useMemo(() => {
    const liveDoc = editor?.getJSON() ?? null;
    const reconciled: PanelThread[] = reconcileThreads<FeatureCommentRow>(
      liveDoc,
      comments,
    );
    if (pending && !reconciled.some((t) => t.threadId === pending.threadId)) {
      return [
        {
          threadId: pending.threadId,
          status: "anchored",
          quotedText: pending.quotedText,
          comments: [],
        },
        ...reconciled,
      ];
    }
    return reconciled;
    // docTick drives recompute as marks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, comments, pending, docTick]);

  const startComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      notifications.show({
        message: "Select some text to comment on.",
        color: "yellow",
      });
      return;
    }
    const quotedText = editor.state.doc.textBetween(from, to, " ").slice(0, 1000);
    const threadId = newThreadId();
    const anchor = computeAnchor(editor.view, from, to);
    editor.chain().focus().setMark("comment", { threadId }).run();
    // setMark's onUpdate scheduled a debounced autosave; flush it now so we don't
    // fire two concurrent saves with the same baseVersion (which can race into a
    // spurious stale-write conflict). Persist the mark right away instead so the
    // thread is anchored on reload.
    flushSaveRef.current();
    setPending({ threadId, quotedText });
    setActiveThreadId(threadId);
    setAnchorPos(anchor);
  };

  // Find the document position of a thread's comment mark (for anchoring the
  // popover when a thread is opened from the bottom list).
  const findThreadPos = (threadId: string): number | null => {
    if (!editor) return null;
    let found: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found != null) return false;
      if (
        node.isText &&
        node.marks.some(
          (m) => m.type.name === "comment" && m.attrs.threadId === threadId,
        )
      ) {
        found = pos;
        return false;
      }
      return undefined;
    });
    return found;
  };

  // Opening a thread from the bottom list: anchor the popover at its highlight if
  // the anchor still exists; orphaned threads (no mark) fall back to the list's
  // own inline composer.
  const openThreadFromList = (threadId: string) => {
    setActiveThreadId(threadId);
    const pos = findThreadPos(threadId);
    if (pos != null && editor) {
      setAnchorPos(computeAnchor(editor.view, pos, pos));
    } else {
      setAnchorPos(null);
    }
  };

  const submitComment = async (threadId: string, body: string) => {
    if (pending?.threadId === threadId) {
      // First comment on a brand-new thread → create the root (carries quotedText).
      await createComment.mutateAsync({
        featureId,
        threadId,
        body,
        quotedText: pending.quotedText,
      });
      setPending((p) => (p?.threadId === threadId ? null : p));
    } else {
      // Existing thread → threaded reply hanging off its root.
      const thread = panelThreads.find((t) => t.threadId === threadId);
      const root = thread?.comments.find((c) => !c.parentId) ?? thread?.comments[0];
      if (root) {
        await replyComment.mutateAsync({ parentId: root.id, body });
      } else {
        await createComment.mutateAsync({ featureId, threadId, body });
      }
    }
    setActiveThreadId(threadId);
    await utils.product.featureComment.list.invalidate({ featureId });
  };

  const handleResolve = async (threadId: string) => {
    await resolveThread.mutateAsync({ featureId, threadId });
    await utils.product.featureComment.list.invalidate({ featureId });
  };

  const handleUnresolve = async (threadId: string) => {
    await unresolveThread.mutateAsync({ featureId, threadId });
    await utils.product.featureComment.list.invalidate({ featureId });
  };

  const handleEditComment = async (commentId: string, body: string) => {
    await updateComment.mutateAsync({ commentId, body });
    await utils.product.featureComment.list.invalidate({ featureId });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteComment.mutate(
      { commentId },
      {
        onSuccess: () => {
          void utils.product.featureComment.list.invalidate({ featureId });
        },
      },
    );
  };

  const commentsPanel = enableComments ? (
    <PrdCommentsPanel
      threads={panelThreads}
      activeThreadId={activeThreadId}
      pendingThreadId={pending?.threadId ?? null}
      onSelect={openThreadFromList}
      onSubmit={submitComment}
      onResolve={handleResolve}
      onUnresolve={handleUnresolve}
      currentUserId={currentUserId}
      // When the anchored popover is open it owns the composer; the list shows
      // its inline composer only for orphaned/list-opened threads.
      composerActive={anchorPos === null}
      isSubmitting={createComment.isPending || replyComment.isPending}
    />
  ) : null;

  const activeThread =
    activeThreadId != null
      ? panelThreads.find((t) => t.threadId === activeThreadId) ?? null
      : null;

  const threadPopover =
    enableComments && activeThreadId && anchorPos ? (
      <PrdThreadPopover
        threadId={activeThreadId}
        comments={activeThread?.comments ?? []}
        status={activeThread?.status ?? "pending"}
        position={anchorPos}
        currentUserId={currentUserId}
        onSubmit={(body) => submitComment(activeThreadId, body)}
        onEdit={handleEditComment}
        onDelete={handleDeleteComment}
        onResolve={() => void handleResolve(activeThreadId)}
        onUnresolve={() => void handleUnresolve(activeThreadId)}
        onClose={closeThread}
        isSubmitting={createComment.isPending || replyComment.isPending}
      />
    ) : null;

  const commentButton =
    enableComments && editable ? (
      <RichTextEditor.Control
        onClick={startComment}
        aria-label="Comment on selection"
        title="Comment on selection"
      >
        <IconMessagePlus size={16} />
      </RichTextEditor.Control>
    ) : null;

  return (
    <Stack gap="lg">
      <RichDocEditor
        initialDoc={descriptionDoc}
        initialMarkdown={description}
        docVersion={docVersion}
        editable={editable}
        conflict={{
          title: "This PRD changed",
          message:
            "Someone else saved a newer version of this PRD. Reload to get the latest? Unsaved changes in this tab will be lost.",
        }}
        onSave={async ({ doc, markdown, baseVersion }) =>
          updateFeature.mutateAsync({
            id: featureId,
            descriptionDoc: doc,
            description: markdown,
            baseVersion,
          })
        }
        onInitDoc={(doc) => initDescriptionDoc.mutate({ id: featureId, doc })}
        uploadImage={(base64Data) =>
          uploadImageMutation.mutateAsync({ id: featureId, base64Data })
        }
        extraExtensions={enableComments ? [CommentResolution] : undefined}
        bubbleExtras={commentButton}
        onDocUpdate={enableComments ? () => setDocTick((t) => t + 1) : undefined}
        onReady={handleReady}
        wrapperRef={wrapperRef}
        editorClick={
          enableComments
            ? (view, pos) => {
                const mark = view.state.doc
                  .resolve(pos)
                  .marks()
                  .find((m) => m.type.name === "comment");
                const threadId = mark?.attrs.threadId as string | undefined;
                if (threadId) {
                  setActiveThreadId(threadId);
                  setAnchorPos(computeAnchor(view, pos, pos));
                } else {
                  closeThread();
                }
                return false;
              }
            : undefined
        }
        overlay={threadPopover}
      />
      {commentsPanel}
    </Stack>
  );
}
