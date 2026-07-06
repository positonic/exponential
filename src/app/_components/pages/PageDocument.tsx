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
}

/**
 * The Knowledge Page body editor (ADR-0033): the shared {@link RichDocEditor}
 * engine wired to the Page `bodyDoc`/`body`/`docVersion` storage. Anchored
 * comments are intentionally OUT of scope for Pages v1, so no comment layer is
 * passed — the engine renders just the document surface.
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
}: PageDocumentProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const initBodyDoc = api.page.initBodyDoc.useMutation();
  const updatePage = api.page.update.useMutation();
  const uploadImage = api.page.uploadImage.useMutation();
  const createPage = api.page.create.useMutation();
  const createPageMutate = createPage.mutate;

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
                      href: `/w/${workspaceSlug}/pages/${page.id}`,
                    },
                  })
                  .run();
                // Persist the link now — navigating away unmounts the editor
                // before the debounced autosave would fire — and mark this
                // page's cached doc stale so back-navigation refetches it.
                handleRef.current?.flushSave();
                void utils.page.get.invalidate({ id: pageId });
                void utils.page.list.invalidate();
                router.push(`/w/${workspaceSlug}/pages/${page.id}`);
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
      onReady={(handle) => {
        handleRef.current = handle;
      }}
    />
  );
}
