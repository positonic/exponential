"use client";

import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { Stack } from "@mantine/core";
import { api } from "~/trpc/react";
import {
  RichDocEditor,
} from "~/app/_components/shared/RichDocEditor";
import { useAnchoredComments } from "~/app/_components/prd/useAnchoredComments";
import type { FeatureCommentRow } from "~/app/_components/prd/PrdCommentsPanel";

interface FeatureBodyDocumentProps {
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

/**
 * The **PRD body** editor (ADR-0024): the shared {@link RichDocEditor} engine
 * wired to the Feature `descriptionDoc`/`description`/`docVersion` storage, plus
 * the shared anchored-comments layer ({@link useAnchoredComments}) over the
 * featureComment router. With `enableComments`, a member can select text and
 * pin a comment thread to it via a `comment` mark; the highlight stays glued
 * to the words via ProseMirror position mapping, and the discussion panel
 * lists reconciled threads (anchored vs orphaned).
 */
export function FeatureBodyDocument({
  featureId,
  descriptionDoc,
  description,
  docVersion = 0,
  editable = false,
  enableComments = false,
}: FeatureBodyDocumentProps) {
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

  const commentsQuery = api.product.featureComment.list.useQuery(
    { featureId },
    { enabled: enableComments },
  );
  const comments = useMemo(
    () => (commentsQuery.data ?? []) as FeatureCommentRow[],
    [commentsQuery.data],
  );
  const invalidateComments = () =>
    utils.product.featureComment.list.invalidate({ featureId });

  const anchored = useAnchoredComments({
    enabled: enableComments,
    editable,
    adapter: {
      comments,
      createThread: async ({ threadId, body, quotedText }) => {
        await createComment.mutateAsync({ featureId, threadId, body, quotedText });
        await invalidateComments();
      },
      reply: async ({ parentId, body }) => {
        await replyComment.mutateAsync({ parentId, body });
        await invalidateComments();
      },
      editComment: async ({ commentId, body }) => {
        await updateComment.mutateAsync({ commentId, body });
        await invalidateComments();
      },
      deleteComment: async ({ commentId }) => {
        await deleteComment.mutateAsync({ commentId });
        await invalidateComments();
      },
      resolveThread: async (threadId) => {
        await resolveThread.mutateAsync({ featureId, threadId });
        await invalidateComments();
      },
      unresolveThread: async (threadId) => {
        await unresolveThread.mutateAsync({ featureId, threadId });
        await invalidateComments();
      },
      isSubmitting: createComment.isPending || replyComment.isPending,
    },
  });

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
        extraExtensions={anchored.extraExtensions}
        bubbleExtras={anchored.bubbleExtras}
        onDocUpdate={anchored.onDocUpdate}
        onReady={anchored.handleReady}
        wrapperRef={anchored.wrapperRef}
        editorClick={anchored.editorClick}
        overlay={anchored.overlay}
      />
      {anchored.panel}
    </Stack>
  );
}
