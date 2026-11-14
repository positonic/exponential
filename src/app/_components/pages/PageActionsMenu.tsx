"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Menu, Switch } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconFolderShare,
  IconHistory,
  IconLink,
  IconMarkdown,
  IconPrinter,
  IconSearch,
  IconTrash,
  IconViewportNarrow,
  IconViewportWide,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import {
  buildMarkdownExport,
  markdownFilename,
} from "~/lib/pages/markdown-export";
import { PageDeleteDialog } from "~/app/_components/pages/PageDeleteDialog";
import { PageMoveDialog } from "~/app/_components/pages/PageMoveDialog";

/** Both export paths read the open editor, so neither can run before it has
 * mounted: a rare race, but a silent one without a message. */
const EDITOR_NOT_READY = "The editor is still loading. Try again in a moment.";

export interface PageActionsMenuProps {
  pageId: string;
  /** Page title: the H1 of the Markdown export, its filename, and the text
   * the Delete dialog asks to be typed. */
  pageTitle: string;
  workspaceId: string;
  workspaceSlug: string;
  /** Current placement; null means the page sits at workspace level. */
  projectId: string | null;
  includeInSearch: boolean;
  canEdit: boolean;
  /** A database Row (ADR-0078) takes its placement, search inclusion and
   * lifetime from its database, so the server refuses those verbs on it. */
  isRow?: boolean;
  /**
   * The live editor's Markdown projection, read at click time so Copy
   * markdown and Export carry edits the debounced autosave hasn't written
   * yet. Returns null before the editor has mounted.
   */
  getMarkdown: () => string | null;
  /** Reader-side column preference (per browser, not per page). */
  fullWidth: boolean;
  onToggleFullWidth: () => void;
  /** Opens the page history panel (ADR-0074). */
  onOpenHistory?: () => void;
}

/**
 * The Page actions menu: the `•••` beside Share on a page. Split out of
 * `PageShareMenu` so sharing (a consent surface) and the per-page verbs are
 * separate components.
 *
 * Everyone gets the read-only items: Full width, Copy link, Open in new tab,
 * Copy markdown, Export and History. The verbs that change or create pages
 * (Move to project, Include in search, Duplicate, Delete) are for editors
 * only; the server refuses them for anyone else anyway.
 */
export function PageActionsMenu({
  pageId,
  pageTitle,
  workspaceId,
  workspaceSlug,
  projectId,
  includeInSearch,
  canEdit,
  isRow = false,
  getMarkdown,
  fullWidth,
  onToggleFullWidth,
  onOpenHistory,
}: PageActionsMenuProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const canManage = canEdit && !isRow;

  const onError = (title: string, message: string) =>
    notifications.show({ color: "red", title, message });

  // The internal editor path, never the public /p/... URL: this is the link
  // you send a colleague, and it works whether or not the page is published.
  // Copying the public URL is the Share popover's job.
  const editorPath = buildPageEditorPath(workspaceSlug, pageId);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${editorPath}`);
      notifications.show({ color: "teal", message: "Link copied" });
    } catch {
      onError("Could not copy the link", "Your browser blocked clipboard access.");
    }
  };

  /** Title-as-H1 + the live body projection, or null if the editor isn't up. */
  const markdownDocument = () => {
    const body = getMarkdown();
    return body == null ? null : buildMarkdownExport(pageTitle, body);
  };

  const copyMarkdown = async () => {
    const markdown = markdownDocument();
    if (markdown == null) {
      onError("Could not copy the Markdown", EDITOR_NOT_READY);
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      notifications.show({
        color: "teal",
        title: "Copied as Markdown",
        message: "Paste into Notion, Obsidian, or any Markdown editor.",
      });
    } catch {
      // Denied permission, or a non-secure origin.
      onError("Could not copy", "Your browser blocked clipboard access.");
    }
  };

  // Client-side download: a Blob URL, no server render.
  const exportMarkdown = () => {
    const markdown = markdownDocument();
    if (markdown == null) {
      onError("Could not export the page", EDITOR_NOT_READY);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = markdownFilename(pageTitle);
    // Attached, clicked, and revoked on the next tick: a detached anchor with
    // a same-frame revoke works in Chromium but aborts the download in
    // Firefox and WebKit.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Whether this page has sub-pages: gates "Duplicate with sub-pages". Shares
  // the cache with the Sub-pages list under the body.
  const children = api.page.children.useQuery({ id: pageId }, { enabled: canManage });
  const hasSubpages = (children.data?.length ?? 0) > 0;

  const duplicate = api.page.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      router.push(buildPageEditorPath(workspaceSlug, copy.id));
    },
    onError: (e) => onError("Could not duplicate page", e.message),
  });

  // Whether the page's body feeds workspace search (ADR-0033). Patches the
  // cached page instead of invalidating it: a refetch would swap
  // bodyDoc/docVersion under the open editor.
  const setIncludeInSearch = api.page.update.useMutation({
    onSuccess: (_data, vars) => {
      const next = vars.includeInSearch;
      if (next === undefined) return;
      utils.page.get.setData({ id: pageId }, (old) =>
        old ? { ...old, includeInSearch: next } : old,
      );
    },
    onError: (e) => onError("Could not update search inclusion", e.message),
  });

  return (
    <>
      <Menu position="bottom-end" shadow="md" width={240}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Page actions">
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown data-testid="page-actions-menu">
          <Menu.Item
            leftSection={
              fullWidth ? <IconViewportNarrow size={14} /> : <IconViewportWide size={14} />
            }
            rightSection={
              <Switch
                size="xs"
                checked={fullWidth}
                readOnly
                tabIndex={-1}
                aria-hidden
                // Decorative: every click lands on the menu item once,
                // instead of the switch's label and input each firing.
                className="pointer-events-none"
              />
            }
            closeMenuOnClick={false}
            onClick={onToggleFullWidth}
            aria-pressed={fullWidth}
          >
            Full width
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconLink size={14} />} onClick={() => void copyLink()}>
            Copy link
          </Menu.Item>
          <Menu.Item
            component="a"
            href={editorPath}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconExternalLink size={14} />}
          >
            Open in new tab
          </Menu.Item>
          {/* Plain copy (Cmd-C) puts text and the formatted slice on the
              clipboard; this is the explicit route for a Markdown target. */}
          <Menu.Item
            leftSection={<IconMarkdown size={14} />}
            onClick={() => void copyMarkdown()}
          >
            Copy markdown
          </Menu.Item>
          {/* A labelled section rather than a flyout: Mantine 7.17 ships the
              MenuSub files but attaches no Menu.Sub (that lands in v8). Same
              items, same order, no hover-only target. */}
          <Menu.Label>Export</Menu.Label>
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportMarkdown}>
            Markdown
          </Menu.Item>
          <Menu.Item
            leftSection={<IconPrinter size={14} />}
            // The browser's dialog is the whole PDF export; the `@media print`
            // block in globals.css strips the chrome (this menu included).
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </Menu.Item>
          {onOpenHistory ? (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconHistory size={14} />}
                onClick={onOpenHistory}
                data-testid="page-history-open"
              >
                History
              </Menu.Item>
            </>
          ) : null}
          {canManage ? (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconFolderShare size={14} />}
                onClick={() => setMoveOpen(true)}
              >
                Move to project…
              </Menu.Item>
              {/* The switch is the state; the row is the control, and stays
                  open so the change is visible. */}
              <Menu.Item
                leftSection={<IconSearch size={14} />}
                closeMenuOnClick={false}
                // `includeInSearch` only moves on success, so a second click
                // before the first lands would resend the same value.
                disabled={setIncludeInSearch.isPending}
                onClick={() =>
                  setIncludeInSearch.mutate({ id: pageId, includeInSearch: !includeInSearch })
                }
                aria-pressed={includeInSearch}
                rightSection={
                  <Switch
                    size="xs"
                    checked={includeInSearch}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                }
              >
                Include in search
              </Menu.Item>
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
                  onClick={() => duplicate.mutate({ id: pageId, withSubpages: true })}
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

      {canManage ? (
        <>
          <PageMoveDialog
            pageId={pageId}
            workspaceId={workspaceId}
            projectId={projectId}
            opened={moveOpen}
            onClose={() => setMoveOpen(false)}
          />
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
      ) : null}
    </>
  );
}
