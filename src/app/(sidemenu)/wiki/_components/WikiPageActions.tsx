"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Button, Group, Menu, Modal, Text, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";

import type { WikiBridge } from "~/lib/localWiki";
import { reportHandledError } from "~/lib/reportHandledError";
import { WIKI_ROUTE, wikiHref } from "~/lib/wiki/wikiLinks";

/**
 * Rename and delete for one page.
 *
 * Both go through `commitTurn` the same way every other write does, so `git log`
 * stays the single record of what happened to this wiki — there is no second
 * audit trail to keep honest, and `git revert` undoes either one.
 *
 * Both also confirm first, for the same reason: the librarian may have written
 * this page, and it does not get a say here.
 */
export function WikiPageActions({
  bridge,
  path,
  onChanged,
}: {
  bridge: WikiBridge;
  path: string;
  /** Re-read after a rename that stayed on the same route. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rename = useCallback(
    async (to: string) => {
      setBusy(true);
      try {
        const result = await bridge.renamePage(path, to);
        await bridge.commitTurn(`Rename ${result.from} to ${result.to}`);
        setRenaming(null);

        // Say how many other pages this edited. A rename rewrites inbound
        // [[wikilinks]] so they keep working, and finding that out later from
        // `git log` would be a nasty surprise.
        const count = result.relinked.length;
        notifications.show({
          title: "Page renamed",
          message:
            count === 0
              ? `Now at ${result.to}. Nothing linked to it.`
              : `Now at ${result.to}. Repointed links on ${count} other ${
                  count === 1 ? "page" : "pages"
                }.`,
        });
        router.replace(wikiHref(result.to));
        onChanged();
      } catch (e) {
        reportHandledError(e, { area: "local-wiki-rename" });
        notifications.show({
          color: "red",
          title: "Couldn't rename",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [bridge, path, router, onChanged],
  );

  const remove = useCallback(async () => {
    try {
      await bridge.deletePage(path);
      await bridge.commitTurn(`Delete ${path}`);
      notifications.show({ title: "Page deleted", message: `${path} is gone from the wiki.` });
      router.replace(WIKI_ROUTE);
    } catch (e) {
      reportHandledError(e, { area: "local-wiki-delete" });
      notifications.show({
        color: "red",
        title: "Couldn't delete",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [bridge, path, router]);

  const confirmDelete = useCallback(() => {
    modals.openConfirmModal({
      title: "Delete this page?",
      children: (
        <>
          <Text size="sm" mt="xs">
            Removes {path} from the wiki folder. The librarian may have written it,
            and gets no say here.
          </Text>
          <Text size="sm" mt="sm" c="dimmed">
            Links to it become the &ldquo;not written yet&rdquo; kind — how the wiki
            marks something worth writing. It stays in the git history, so this is
            undoable.
          </Text>
        </>
      ),
      labels: { confirm: "Delete", cancel: "Keep it" },
      confirmProps: { color: "red" },
      onConfirm: () => void remove(),
    });
  }, [path, remove]);

  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="default" aria-label="Page actions">
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(path)}>
            Rename…
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={confirmDelete}
          >
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename page"
        centered
      >
        <TextInput
          label="New path"
          description="Relative to the wiki root. Folders are created as needed; .md is added if you leave it off."
          value={renaming ?? ""}
          onChange={(e) => setRenaming(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renaming?.trim()) {
              e.preventDefault();
              void rename(renaming.trim());
            }
          }}
          data-autofocus
        />
        <Text className="mt-3 text-xs text-text-muted">
          Every <code>[[wikilink]]</code> pointing at this page will be repointed at
          the new path, so nothing that links here breaks. The move and those edits
          land as one commit.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" color="gray" onClick={() => setRenaming(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => renaming?.trim() && void rename(renaming.trim())}
            disabled={!renaming?.trim() || renaming.trim() === path}
            loading={busy}
          >
            Rename
          </Button>
        </Group>
      </Modal>
    </>
  );
}
