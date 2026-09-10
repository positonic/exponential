"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconDots, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { PageDeleteDialog } from "./PageDeleteDialog";

interface PageActionsMenuProps {
  pageId: string;
  pageTitle: string;
  workspaceSlug: string;
  canEdit: boolean;
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
}: PageActionsMenuProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onError = (error: { message: string }, title: string) =>
    notifications.show({ color: "red", title, message: error.message });

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

  // Every item so far requires edit access; viewers get their own read-only
  // items in a later slice, so until then there is nothing to open.
  if (!canEdit) return null;

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
