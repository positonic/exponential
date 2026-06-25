"use client";

import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { RichDocEditor } from "~/app/_components/shared/RichDocEditor";

interface PageDocumentProps {
  pageId: string;
  /** Canonical ProseMirror document; null until the page is first migrated. */
  bodyDoc: JSONContent | null;
  /** Derived Markdown projection — source of the one-time migration. */
  body: string | null;
  docVersion?: number;
  editable?: boolean;
}

/**
 * The Knowledge Page body editor (ADR-0033): the shared {@link RichDocEditor}
 * engine wired to the Page `bodyDoc`/`body`/`docVersion` storage. Anchored
 * comments are intentionally OUT of scope for Pages v1, so no comment layer is
 * passed — the engine renders just the document surface.
 */
export function PageDocument({
  pageId,
  bodyDoc,
  body,
  docVersion = 0,
  editable = false,
}: PageDocumentProps) {
  const initBodyDoc = api.page.initBodyDoc.useMutation();
  const updatePage = api.page.update.useMutation();
  const uploadImage = api.page.uploadImage.useMutation();

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
    />
  );
}
