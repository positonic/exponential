"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { RichTextEditor } from "@mantine/tiptap";
import { notifications } from "@mantine/notifications";
import { IconMessagePlus } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useWorkspaceMentionCandidates } from "~/hooks/useWorkspaceMentionCandidates";
import { reconcileThreads } from "~/lib/prd/thread-reconciliation";
import {
  CommentResolution,
  setResolvedThreadIds,
} from "~/lib/prd/comment-resolution";
import type { RichDocEditorHandle } from "~/app/_components/shared/RichDocEditor";
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

function newThreadId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `thread-${Date.now()}-${Math.round(performance.now())}`;
}

/** The entity-specific persistence the anchored-comment layer runs on. Hosts
 *  wire these to their comment router (featureComment, pageComment, …).
 *
 *  CONTRACT: every mutation callback must refresh `comments` (i.e. await the
 *  list invalidation) before resolving — the hook renders threads straight
 *  from `comments`, so an adapter that skips the refresh leaves the popover
 *  and panel showing a stale thread after posting. */
export interface AnchoredCommentsAdapter {
  /** All comment rows for the document (threads are filtered here). */
  comments: FeatureCommentRow[];
  /** Root comment on a brand-new thread; carries the highlight snapshot. */
  createThread: (args: { threadId: string; body: string; quotedText?: string }) => Promise<unknown>;
  reply: (args: { parentId: string; body: string }) => Promise<unknown>;
  editComment: (args: { commentId: string; body: string }) => Promise<unknown>;
  deleteComment: (args: { commentId: string }) => void;
  resolveThread: (threadId: string) => Promise<unknown>;
  unresolveThread: (threadId: string) => Promise<unknown>;
  isSubmitting: boolean;
}

/**
 * The anchored-comments layer for any {@link RichDocEditor} host (ADR-0024,
 * extracted from FeatureBodyDocument so Features and Knowledge Pages share it):
 * select text → pin a thread to it via a `comment` mark; the highlight stays
 * glued to the words through ProseMirror position mapping; the discussion
 * panel lists reconciled threads (anchored vs orphaned vs resolved).
 *
 * Returns the RichDocEditor prop fragment (`extraExtensions`, `bubbleExtras`,
 * `onDocUpdate`, `editorClick`, `overlay`, `wrapperRef` target) plus the panel
 * node to render under the editor. The host must call `handleReady` from its
 * own `onReady`, and spread nothing when `enabled` is false.
 */
export function useAnchoredComments({
  enabled,
  editable,
  adapter,
}: {
  enabled: boolean;
  /** The comment-on-selection affordance needs doc write access (it sets a mark). */
  editable: boolean;
  adapter: AnchoredCommentsAdapter;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const flushSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Bumped on every doc change so thread reconciliation re-reads the live marks.
  const [docTick, setDocTick] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ threadId: string; quotedText: string } | null>(null);
  // When set, the active thread shows as a popover anchored under its highlight;
  // when null, the active thread's composer lives in the bottom Discussion list.
  const [anchorPos, setAnchorPos] = useState<AnchorPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { comments } = adapter;
  const mentionCandidates = useWorkspaceMentionCandidates();
  const mentionNames = useMemo(
    () => mentionCandidates.map((c) => c.name),
    [mentionCandidates],
  );

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

  // Strip every `comment` mark carrying this threadId from the document and
  // persist. This is how a highlight is undone — the mark is the only trace a
  // never-commented thread leaves.
  const removeThreadMark = (threadId: string) => {
    if (!editor) return;
    const { doc, schema } = editor.state;
    const markType = schema.marks.comment;
    if (!markType) return;
    const tr = editor.state.tr;
    doc.descendants((node, pos) => {
      if (!node.isText) return undefined;
      for (const mark of node.marks) {
        if (mark.type === markType && mark.attrs.threadId === threadId) {
          tr.removeMark(pos, pos + node.nodeSize, mark);
        }
      }
      return undefined;
    });
    if (tr.docChanged) {
      editor.view.dispatch(tr);
      void flushSaveRef.current();
    }
  };

  const closeThread = () => {
    // Closing (escape / outside click / X) a thread nobody has commented on
    // yet discards it entirely — otherwise the yellow highlight would stay
    // behind with no thread to open. Skip while a first comment is mid-post.
    if (activeThreadId && editable && !adapter.isSubmitting) {
      const hasRows = comments.some((c) => c.threadId === activeThreadId);
      if (!hasRows) {
        removeThreadMark(activeThreadId);
        setPending((p) => (p?.threadId === activeThreadId ? null : p));
      }
    }
    setActiveThreadId(null);
    setAnchorPos(null);
  };

  // Deleting a thread's root comment cascades its replies away in the DB;
  // clean up the highlight too or it would linger with an empty thread.
  const handleDeleteComment = (commentId: string) => {
    const row = comments.find((c) => c.id === commentId);
    adapter.deleteComment({ commentId });
    if (row && !row.parentId && row.threadId && editable) {
      removeThreadMark(row.threadId);
      closeThread();
    }
  };

  const handleReady = (handle: RichDocEditorHandle) => {
    setEditor(handle.editor);
    flushSaveRef.current = handle.flushSave;
  };

  // Push the set of resolved threads to the editor so their highlights hide.
  useEffect(() => {
    if (!editor || !enabled) return;
    const resolved = new Set(
      comments
        .filter((c) => !c.parentId && c.resolvedAt != null)
        .map((c) => c.threadId)
        .filter((t): t is string => !!t),
    );
    setResolvedThreadIds(editor, resolved);
  }, [editor, comments, enabled]);

  // Reconcile threads against the live document; include a pending (just-created,
  // not-yet-saved) thread so its composer shows immediately.
  const panelThreads: PanelThread[] = useMemo(() => {
    const liveDoc: JSONContent | null = editor?.getJSON() ?? null;
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
    void flushSaveRef.current();
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
      await adapter.createThread({ threadId, body, quotedText: pending.quotedText });
      setPending((p) => (p?.threadId === threadId ? null : p));
    } else {
      // Existing thread → threaded reply hanging off its root.
      const thread = panelThreads.find((t) => t.threadId === threadId);
      const root = thread?.comments.find((c) => !c.parentId) ?? thread?.comments[0];
      if (root) {
        await adapter.reply({ parentId: root.id, body });
      } else {
        await adapter.createThread({ threadId, body });
      }
    }
    setActiveThreadId(threadId);
  };

  const handleEditComment = async (commentId: string, body: string) => {
    await adapter.editComment({ commentId, body });
  };

  const panel = enabled ? (
    <PrdCommentsPanel
      threads={panelThreads}
      activeThreadId={activeThreadId}
      pendingThreadId={pending?.threadId ?? null}
      onSelect={openThreadFromList}
      onSubmit={submitComment}
      onResolve={async (threadId) => void (await adapter.resolveThread(threadId))}
      onUnresolve={async (threadId) => void (await adapter.unresolveThread(threadId))}
      currentUserId={currentUserId}
      mentionCandidates={mentionCandidates}
      mentionNames={mentionNames}
      // When the anchored popover is open it owns the composer; the list shows
      // its inline composer only for orphaned/list-opened threads.
      composerActive={anchorPos === null}
      isSubmitting={adapter.isSubmitting}
    />
  ) : null;

  const activeThread =
    activeThreadId != null
      ? panelThreads.find((t) => t.threadId === activeThreadId) ?? null
      : null;

  const overlay =
    enabled && activeThreadId && anchorPos ? (
      <PrdThreadPopover
        threadId={activeThreadId}
        comments={activeThread?.comments ?? []}
        status={activeThread?.status ?? "pending"}
        position={anchorPos}
        currentUserId={currentUserId}
        onSubmit={(body) => submitComment(activeThreadId, body)}
        onEdit={handleEditComment}
        onDelete={handleDeleteComment}
        onResolve={() => void adapter.resolveThread(activeThreadId)}
        onUnresolve={() => void adapter.unresolveThread(activeThreadId)}
        onClose={closeThread}
        // Explicit "remove highlight" for a not-yet-posted thread; closing
        // does the same implicitly, but the affordance makes it discoverable.
        onDiscard={
          editable
            ? () => {
                removeThreadMark(activeThreadId);
                setPending((p) => (p?.threadId === activeThreadId ? null : p));
                setActiveThreadId(null);
                setAnchorPos(null);
              }
            : undefined
        }
        mentionCandidates={mentionCandidates}
        mentionNames={mentionNames}
        isSubmitting={adapter.isSubmitting}
      />
    ) : null;

  const bubbleExtras =
    enabled && editable ? (
      <RichTextEditor.Control
        onClick={startComment}
        aria-label="Comment on selection"
        title="Comment on selection"
      >
        <IconMessagePlus size={16} />
      </RichTextEditor.Control>
    ) : null;

  const editorClick = enabled
    ? (view: EditorView, pos: number) => {
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
    : undefined;

  const extraExtensions: Extensions | undefined = enabled
    ? [CommentResolution]
    : undefined;

  return {
    /** RichDocEditor prop fragment. */
    extraExtensions,
    bubbleExtras,
    onDocUpdate: enabled ? () => setDocTick((t) => t + 1) : undefined,
    editorClick,
    overlay,
    /** Pass as RichDocEditor's wrapperRef so popover math has the geometry. */
    wrapperRef,
    /** Call from the host's onReady. */
    handleReady,
    /** Render under the editor. */
    panel,
  };
}
