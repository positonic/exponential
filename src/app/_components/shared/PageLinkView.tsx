"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { IconFileText } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { PageLink } from "~/lib/prd/page-link";

/**
 * Interactive node view for the {@link PageLink} block: a clickable link to
 * another Knowledge Page showing its **live** title. The title comes from the
 * already-cached `page.list` query (one shared query for every link in the
 * doc), which `PageTitle` invalidates on rename — so renaming a page updates
 * every link to it without touching the documents that link there. The `title`
 * attr is only a snapshot fallback (page deleted / no access / loading); while
 * the doc is editable we sync the live title back into the attr so the
 * Markdown projection and public render stay current.
 */
function PageLinkView({ node, editor, updateAttributes }: NodeViewProps) {
  const pageId = node.attrs.pageId as string | null;
  const cachedTitle = (node.attrs.title as string | null) ?? "Untitled";
  const { workspace, workspaceId } = useWorkspace();

  const { data: pages } = api.page.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const livePage = pages?.find((p) => p.id === pageId);
  const liveTitle = livePage?.title;
  const title = liveTitle ?? cachedTitle;

  useEffect(() => {
    if (editor.isEditable && liveTitle && liveTitle !== cachedTitle) {
      updateAttributes({ title: liveTitle });
    }
  }, [editor.isEditable, liveTitle, cachedTitle, updateAttributes]);

  const href =
    workspace && pageId
      ? `/w/${workspace.slug}/pages/${pageId}`
      : ((node.attrs.href as string | null) ?? "#");

  return (
    <NodeViewWrapper data-type="page-link" className="page-link-block my-1">
      <Link
        href={href}
        contentEditable={false}
        draggable={false}
        className="inline-flex max-w-full items-center gap-2 rounded-md px-1 py-0.5 no-underline hover:bg-surface-hover"
      >
        <IconFileText size={18} className="shrink-0 text-text-muted" />
        <span className="truncate font-medium text-text-primary underline decoration-border-primary underline-offset-2">
          {title}
        </span>
      </Link>
    </NodeViewWrapper>
  );
}

/** The {@link PageLink} node with the interactive React view attached — what
 * the live editor uses in place of the headless base node. */
export const PageLinkWithView = PageLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },
});
