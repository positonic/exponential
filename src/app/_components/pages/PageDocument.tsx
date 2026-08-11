"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { notifications } from "@mantine/notifications";
import { IconFileText } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  RichDocEditor,
  type RichDocEditorHandle,
} from "~/app/_components/shared/RichDocEditor";
import type { SlashCommandItem } from "~/lib/prd/slash-command";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { useAnchoredComments } from "~/app/_components/prd/useAnchoredComments";

interface PageDocumentProps {
  pageId: string;
  /** Canonical ProseMirror document; null until the page is first migrated. */
  bodyDoc: JSONContent | null;
  /** Derived Markdown projection — source of the one-time migration. */
  body: string | null;
  docVersion?: number;
  editable?: boolean;
  /** Placement of the page — the `/page` command creates the new page in the
   * same workspace/project so it inherits identical visibility. */
  workspaceId: string;
  workspaceSlug: string;
  projectId?: string | null;
  /** Forwards the editor handle to the host (e.g. the Sub-pages panel, which
   * detaches a child by removing its `pageLink` block from the live doc). */
  onEditorReady?: (handle: RichDocEditorHandle) => void;
}

/**
 * The Knowledge Page body editor (ADR-0033): the shared {@link RichDocEditor}
 * engine wired to the Page `bodyDoc`/`body`/`docVersion` storage, plus the
 * shared anchored-comments layer ({@link useAnchoredComments}) over the
 * pageComment router — select text, pin a thread to it, same interaction as
 * the PRD body.
 *
 * Adds the Pages-only `/page` slash command: creates a sibling page (same
 * workspace + project), drops a `pageLink` block at the cursor, flushes the
 * autosave so the link survives navigation, and opens the new page.
 */
export function PageDocument({
  pageId,
  bodyDoc,
  body,
  docVersion = 0,
  editable = false,
  workspaceId,
  workspaceSlug,
  projectId,
  onEditorReady,
}: PageDocumentProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const initBodyDoc = api.page.initBodyDoc.useMutation();
  const updatePage = api.page.update.useMutation();
  const uploadImage = api.page.uploadImage.useMutation();
  const createPage = api.page.create.useMutation();
  const createPageMutate = createPage.mutate;

  const createComment = api.pageComment.create.useMutation();
  const replyComment = api.pageComment.reply.useMutation();
  const updateComment = api.pageComment.update.useMutation();
  const deleteComment = api.pageComment.delete.useMutation();
  const resolveThread = api.pageComment.resolve.useMutation();
  const unresolveThread = api.pageComment.unresolve.useMutation();
  const commentsQuery = api.pageComment.list.useQuery({ pageId });
  // Anchored threads only (threadId set); the doc-level feed below the page
  // renders the rest.
  const comments = useMemo(
    () => (commentsQuery.data ?? []).filter((c) => c.threadId != null),
    [commentsQuery.data],
  );
  const invalidateComments = () => utils.pageComment.list.invalidate({ pageId });

  const anchored = useAnchoredComments({
    enabled: true,
    editable,
    adapter: {
      comments,
      createThread: async ({ threadId, body: commentBody, quotedText }) => {
        await createComment.mutateAsync({ pageId, threadId, body: commentBody, quotedText });
        await invalidateComments();
      },
      reply: async ({ parentId, body: commentBody }) => {
        await replyComment.mutateAsync({ parentId, body: commentBody });
        await invalidateComments();
      },
      editComment: async ({ commentId, body: commentBody }) => {
        await updateComment.mutateAsync({ commentId, body: commentBody });
        await invalidateComments();
      },
      deleteComment: ({ commentId }) => {
        deleteComment.mutate(
          { commentId },
          { onSuccess: () => void invalidateComments() },
        );
      },
      resolveThread: async (threadId) => {
        await resolveThread.mutateAsync({ pageId, threadId });
        await invalidateComments();
      },
      unresolveThread: async (threadId) => {
        await unresolveThread.mutateAsync({ pageId, threadId });
        await invalidateComments();
      },
      isSubmitting: createComment.isPending || replyComment.isPending,
    },
  });

  const handleRef = useRef<RichDocEditorHandle | null>(null);

  const slashExtras = useMemo<SlashCommandItem[]>(
    () => [
      {
        title: "Page",
        description: "Create a new page, linked here",
        icon: IconFileText,
        run: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run();
          createPageMutate(
            { workspaceId, projectId },
            {
              onSuccess: (page) => {
                if (editor.isDestroyed) return;
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "pageLink",
                    attrs: {
                      pageId: page.id,
                      title: page.title,
                      href: buildPageEditorPath(workspaceSlug, page.id),
                    },
                  })
                  .run();
                // Persist the link before navigating — the unmount would drop
                // the debounced autosave — and only then mark this page's
                // cached doc stale, so back-navigation can't refetch the
                // pre-link doc while the save is still in flight.
                void (async () => {
                  await handleRef.current?.flushSave();
                  await utils.page.get.invalidate({ id: pageId });
                  void utils.page.list.invalidate();
                  router.push(`/w/${workspaceSlug}/pages/${page.id}`);
                })();
              },
              onError: () => {
                notifications.show({
                  title: "Could not create page",
                  message: "Please try again.",
                  color: "red",
                });
              },
            },
          );
        },
      },
    ],
    [createPageMutate, workspaceId, projectId, workspaceSlug, pageId, router, utils],
  );

  return (
    <>
      <RichDocEditor
        initialDoc={bodyDoc}
        initialMarkdown={body}
        docVersion={docVersion}
        editable={editable}
        placeholder="Write… select text to format, or type / for blocks."
        conflict={{
          title: "This page changed",
          message:
            "Someone else saved a newer version of this page. Reload to get the latest? Unsaved changes in this tab will be lost.",
        }}
        onSave={async ({ doc, markdown, baseVersion }) =>
          updatePage.mutateAsync({
            id: pageId,
            bodyDoc: doc,
            body: markdown,
            baseVersion,
          })
        }
        onInitDoc={(doc) => initBodyDoc.mutate({ id: pageId, doc })}
        uploadImage={(base64Data) =>
          uploadImage.mutateAsync({ id: pageId, base64Data })
        }
        slashExtras={slashExtras}
        extraExtensions={anchored.extraExtensions}
        bubbleExtras={anchored.bubbleExtras}
        onDocUpdate={anchored.onDocUpdate}
        wrapperRef={anchored.wrapperRef}
        editorClick={anchored.editorClick}
        overlay={anchored.overlay}
        onReady={(handle) => {
          handleRef.current = handle;
          anchored.handleReady(handle);
          onEditorReady?.(handle);
        }}
      />
      {anchored.panel}
    </>
  );
}
