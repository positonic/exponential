"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, BubbleMenu, useEditor } from "@tiptap/react";
import { RichTextEditor } from "@mantine/tiptap";
import type { Editor, JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconMessagePlus } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { SlashCommand } from "~/lib/prd/slash-command";
import { markdownToDoc, EMPTY_DOC, isDocEmpty } from "~/lib/prd/codec";
import { reconcileThreads } from "~/lib/prd/thread-reconciliation";
import {
  CommentResolution,
  setResolvedThreadIds,
} from "~/lib/prd/comment-resolution";
import { usePrdImageUpload } from "~/hooks/usePrdImageUpload";
import {
  PrdCommentsPanel,
  type FeatureCommentRow,
  type PanelThread,
} from "~/app/_components/prd/PrdCommentsPanel";
import { PrdThreadPopover } from "~/app/_components/prd/PrdThreadPopover";
import "@mantine/tiptap/styles.css";

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
 * The single Tiptap component for the **PRD body** (ADR-0024), with `editable`
 * toggled by permission. Read mode renders `descriptionDoc` (lazily migrating a
 * legacy Markdown `description` on first load). Edit mode adds the Tier B
 * surface — bubble menu, `/` slash menu, task lists, code blocks, image
 * paste/drop, placeholder — with debounced autosave and an optimistic-
 * concurrency stale-write guard.
 *
 * With `enableComments`, a workspace member can select text and pin a comment
 * thread to it via a `comment` mark; the highlight stays glued to the words via
 * ProseMirror position mapping, and the discussion panel lists reconciled
 * threads (anchored vs orphaned). The Markdown projection is derived here and
 * sent alongside the JSON on save; comment marks drop from it.
 */
export function PrdDocument({
  featureId,
  descriptionDoc,
  description,
  docVersion = 0,
  editable = false,
  enableComments = false,
}: PrdDocumentProps) {
  const [doc, setDoc] = useState<JSONContent | null>(descriptionDoc);
  const migrationStarted = useRef(false);
  const contentLoaded = useRef(false);

  const versionRef = useRef(docVersion);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictShown = useRef(false);

  // Bumped on every doc change so thread reconciliation re-reads the live marks.
  const [docTick, setDocTick] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ threadId: string; quotedText: string } | null>(null);
  // When set, the active thread shows as a popover anchored under its highlight;
  // when null, the active thread's composer lives in the bottom Discussion list.
  const [anchorPos, setAnchorPos] = useState<AnchorPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
  const createComment = api.product.featureComment.create.useMutation();
  const replyComment = api.product.featureComment.reply.useMutation();
  const updateComment = api.product.featureComment.update.useMutation();
  const deleteComment = api.product.featureComment.delete.useMutation();
  const resolveThread = api.product.featureComment.resolve.useMutation();
  const unresolveThread = api.product.featureComment.unresolve.useMutation();
  const imageHandlers = usePrdImageUpload(featureId);
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

  // Resolve the document to render, migrating legacy Markdown once.
  useEffect(() => {
    if (descriptionDoc) {
      setDoc(descriptionDoc);
      return;
    }
    if (migrationStarted.current) return;
    migrationStarted.current = true;

    if (!description || description.trim() === "") {
      setDoc(EMPTY_DOC);
      return;
    }
    const converted = markdownToDoc(description);
    setDoc(converted);
    initDescriptionDoc.mutate({ id: featureId, doc: converted });
    // initDescriptionDoc is stable; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptionDoc, description, featureId]);

  // Latest save fn behind a ref so the editor's onUpdate closure never goes stale.
  const saveRef = useRef<(editor: Editor) => void>(() => undefined);
  saveRef.current = (editor: Editor) => {
    const json = editor.getJSON();
    const markdown = (
      editor.storage.markdown as { getMarkdown: () => string }
    ).getMarkdown();
    updateFeature.mutate(
      {
        id: featureId,
        descriptionDoc: json,
        description: markdown,
        baseVersion: versionRef.current,
      },
      {
        onSuccess: (res) => {
          if (res && typeof (res as { docVersion?: number }).docVersion === "number") {
            versionRef.current = (res as { docVersion: number }).docVersion;
          }
        },
        onError: (err) => {
          if (err.data?.code === "CONFLICT" && !conflictShown.current) {
            conflictShown.current = true;
            modals.openConfirmModal({
              title: "This PRD changed",
              children: (
                <Text size="sm">
                  Someone else saved a newer version of this PRD. Reload to get the
                  latest? Unsaved changes in this tab will be lost.
                </Text>
              ),
              labels: { confirm: "Reload", cancel: "Keep editing" },
              onConfirm: () => window.location.reload(),
              onCancel: () => {
                conflictShown.current = false;
              },
            });
          }
        },
      },
    );
  };

  const editor = useEditor({
    editable,
    extensions: [
      ...buildPrdExtensions(),
      ...(enableComments ? [CommentResolution] : []),
      ...(editable ? [SlashCommand] : []),
    ],
    content: doc ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      if (enableComments) setDocTick((t) => t + 1);
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveRef.current(e), 1000);
    },
    onBlur: ({ editor: e }) => {
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveRef.current(e);
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
      ...(editable
        ? {
            handlePaste: imageHandlers.handlePaste,
            handleDrop: imageHandlers.handleDrop,
          }
        : {}),
      ...(enableComments
        ? {
            handleClick: (view, pos) => {
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
            },
          }
        : {}),
    },
  });

  // Load the resolved doc into the editor exactly once (never clobber edits).
  useEffect(() => {
    if (editor && doc && !contentLoaded.current) {
      contentLoaded.current = true;
      editor.commands.setContent(doc);
    }
  }, [editor, doc]);

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
    const liveDoc = editor?.getJSON() ?? doc ?? null;
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
  }, [editor, doc, comments, pending, docTick]);

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
    // setMark's onUpdate scheduled a debounced autosave; cancel it so we don't
    // fire two concurrent saves with the same baseVersion (which can race into a
    // spurious stale-write conflict). Persist the mark right away instead so the
    // thread is anchored on reload.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveRef.current(editor);
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

  let body: React.ReactNode;
  if (!editable && doc && isDocEmpty(doc)) {
    body = (
      <Text size="sm" className="text-text-muted">
        No description provided.
      </Text>
    );
  } else if (!editable) {
    body = <EditorContent editor={editor} className="prd-document" />;
  } else {
    body = (
      <RichTextEditor
        editor={editor}
        className="prd-document"
        styles={{
          root: { border: "none", backgroundColor: "transparent" },
          content: { backgroundColor: "transparent", padding: 0 },
        }}
      >
        {editor && (
          <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Code />
              <RichTextEditor.Link />
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              {enableComments && (
                <RichTextEditor.Control
                  onClick={startComment}
                  aria-label="Comment on selection"
                  title="Comment on selection"
                >
                  <IconMessagePlus size={16} />
                </RichTextEditor.Control>
              )}
            </RichTextEditor.ControlsGroup>
          </BubbleMenu>
        )}
        <RichTextEditor.Content />
      </RichTextEditor>
    );
  }

  return (
    <Stack gap="lg">
      <div ref={wrapperRef} className="relative">
        {body}
        {threadPopover}
      </div>
      {commentsPanel}
    </Stack>
  );
}
