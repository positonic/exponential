"use client";

import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { RichDocEditor } from "~/app/_components/shared/RichDocEditor";

interface InsightDocumentProps {
  insightId: string;
  /** Canonical ProseMirror document; null until the insight is first migrated. */
  bodyDoc: JSONContent | null;
  /** Derived Markdown projection - source of the one-time migration. */
  body: string | null;
  docVersion?: number;
  editable?: boolean;
}

/**
 * The Insight detail-page body editor: the shared {@link RichDocEditor} engine
 * wired to the Insight `bodyDoc`/`body`/`docVersion` storage (ADR-0024, same
 * shape as PageDocument/FeatureBodyDocument). No comment layer and no /page command in
 * v1 - just the document surface.
 */
export function InsightDocument({
  insightId,
  bodyDoc,
  body,
  docVersion = 0,
  editable = false,
}: InsightDocumentProps) {
  const initBodyDoc = api.product.insight.initBodyDoc.useMutation();
  const updateInsight = api.product.insight.update.useMutation();
  const uploadImage = api.product.insight.uploadImage.useMutation();

  return (
    <RichDocEditor
      initialDoc={bodyDoc}
      initialMarkdown={body}
      docVersion={docVersion}
      editable={editable}
      placeholder="Describe the insight - context, quotes, evidence, links. Select text to format, or type / for blocks."
      conflict={{
        title: "This insight changed",
        message:
          "Someone else saved a newer version of this insight. Reload to get the latest? Unsaved changes in this tab will be lost.",
      }}
      onSave={async ({ doc, markdown, baseVersion }) =>
        updateInsight.mutateAsync({
          id: insightId,
          bodyDoc: doc,
          body: markdown,
          baseVersion,
        })
      }
      onInitDoc={(doc) => initBodyDoc.mutate({ id: insightId, doc })}
      uploadImage={(base64Data) =>
        uploadImage.mutateAsync({ id: insightId, base64Data })
      }
    />
  );
}
