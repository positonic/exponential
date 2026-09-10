"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionIcon, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconPrinter,
  IconLink,
  IconMarkdown,
  IconTrash,
} from "@tabler/icons-react";
import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { slugifyPageTitle } from "~/lib/pages/public-url";
import { docToMarkdown } from "~/lib/prd/codec";
import { PageDeleteDialog } from "./PageDeleteDialog";

interface PageActionsMenuProps {
  pageId: string;
  pageTitle: string;
  workspaceSlug: string;
  canEdit: boolean;
  /** The *live* editor document, read at click time. Export goes through the
   * open editor rather than the server so it carries edits the debounced
   * autosave hasn't written yet. Undefined until the editor mounts. */
  getDoc?: () => JSONContent | null;
}

/**
 * The Page actions menu — the `•••` beside Share on a page (ADR-0038). Split
 * out of {@link PageShareMenu} so publishing (a consent surface) and the
 * per-page verbs stay separate components.
 *
 * Editors get the whole menu; viewers get only the read-only items, since
 * every other verb would fail server-side anyway.
 */
export function PageActionsMenu({
  pageId,
  pageTitle,
  workspaceSlug,
  canEdit,
  getDoc,
}: PageActionsMenuProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onError = (error: { message: string }, title: string) =>
    notifications.show({ color: "red", title, message: error.message });

  // The *internal* editor path, never the public /p/... URL: this is the link
  // you send a colleague, and it has to keep working whether or not the page
  // is published. Sharing the public URL is the Share popover's job.
  const editorPath = buildPageEditorPath(workspaceSlug, pageId);

  const copyLink = async () => {
    const url = `${window.location.origin}${editorPath}`;
    try {
      await navigator.clipboard.writeText(url);
      notifications.show({ message: "Link copied" });
    } catch (e) {
      onError(e as { message: string }, "Could not copy the link");
    }
  };

  /** The live doc as Markdown, or null when the editor hasn't mounted yet. */
  const liveMarkdown = () => {
    const doc = getDoc?.() ?? null;
    return doc ? docToMarkdown(doc) : null;
  };

  const copyMarkdown = async () => {
    const markdown = liveMarkdown();
    if (markdown === null) return;
    try {
      await navigator.clipboard.writeText(markdown);
      notifications.show({ message: "Markdown copied" });
    } catch (e) {
      onError(e as { message: string }, "Could not copy the Markdown");
    }
  };

  // Client-side download: a Blob URL, no server render. Revoked on the next
  // tick — the click has already handed the blob to the browser by then.
  const exportMarkdown = () => {
    const markdown = liveMarkdown();
    if (markdown === null) return;
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugifyPageTitle(pageTitle)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Whether this page has sub-pages — gates the "with sub-pages" duplicate.
  const children = api.page.children.useQuery({ id: pageId });
  const hasSubpages = (children.data?.length ?? 0) > 0;

  const duplicate = api.page.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      router.push(`/w/${workspaceSlug}/pages/${copy.id}`);
    },
    onError: (e) => onError(e, "Could not duplicate page"),
  });

  return (
    <>
      <Menu position="bottom-end" shadow="md" width={240}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Page actions">
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLink size={14} />}
            onClick={() => void copyLink()}
          >
            Copy link
          </Menu.Item>
          <Menu.Item
            component={Link}
            href={editorPath}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconExternalLink size={14} />}
          >
            Open in new tab
          </Menu.Item>
          <Menu.Item
            leftSection={<IconMarkdown size={14} />}
            onClick={() => void copyMarkdown()}
          >
            Copy markdown
          </Menu.Item>
          {/* A labelled section rather than a flyout: Mantine 7 has no
              Menu.Sub (it lands in v8), and a section keeps the items in the
              same order without a hover-only target. */}
          <Menu.Label>Export</Menu.Label>
          <Menu.Item
            leftSection={<IconDownload size={14} />}
            onClick={exportMarkdown}
          >
            Markdown
          </Menu.Item>
          <Menu.Item
            leftSection={<IconPrinter size={14} />}
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </Menu.Item>
          {canEdit ? (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate({ id: pageId })}
              >
                Duplicate
              </Menu.Item>
              {hasSubpages ? (
                <Menu.Item
                  leftSection={<IconCopy size={14} />}
                  disabled={duplicate.isPending}
                  onClick={() =>
                    duplicate.mutate({ id: pageId, withSubpages: true })
                  }
                >
                  Duplicate with sub-pages
                </Menu.Item>
              ) : null}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Menu.Item>
            </>
          ) : null}
        </Menu.Dropdown>
      </Menu>

      <PageDeleteDialog
        pageId={pageId}
        pageTitle={pageTitle}
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          router.push(`/w/${workspaceSlug}/pages`);
        }}
      />
    </>
  );
}
