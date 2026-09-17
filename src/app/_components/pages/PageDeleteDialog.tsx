"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  List,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface PageDeleteDialogProps {
  pageId: string;
  pageTitle: string;
  opened: boolean;
  onClose: () => void;
  /** Fired after the page is gone — hosts route away or refresh their list. */
  onDeleted: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The confirmation for a hard page delete. There is no archive yet, so this is
 * the end of the page: the dialog states what breaks — pages whose links go
 * dead, sub-pages that become top-level, a public URL that stops resolving —
 * and requires the exact title to be typed, so the destructive click can't be
 * the same reflex as the menu click that opened it.
 *
 * Stating the impact is the only safety rail here, so it is also a
 * precondition: while the counts are loading or failed to load, Delete stays
 * disabled rather than quietly falling back to an unqualified confirmation.
 */
export function PageDeleteDialog({
  pageId,
  pageTitle,
  opened,
  onClose,
  onDeleted,
}: PageDeleteDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const utils = api.useUtils();

  // Fresh dialog every time; a stale confirmed title must not carry over.
  useEffect(() => {
    if (opened) setConfirmation("");
  }, [opened, pageId]);

  const impact = api.page.deleteImpact.useQuery(
    { id: pageId },
    {
      enabled: opened,
      // The counts only matter at the moment of decision, and the body may
      // have gained or lost links since the dialog was last opened.
      staleTime: 0,
      refetchOnMount: "always",
    },
  );

  const deletePage = api.page.delete.useMutation({
    onSuccess: () => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      void utils.favorite.list.invalidate();
      // The link graph moved: a parent's Sub-pages list and any breadcrumb
      // pointing here are both now wrong, and both are cached.
      void utils.page.children.invalidate();
      void utils.page.parentCrumb.invalidate();
      onDeleted();
    },
  });

  const facts = impact.data;
  const canDelete = confirmation === pageTitle && facts !== undefined;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete page" centered>
      <Stack gap="md">
        <Text size="sm" className="text-text-secondary">
          Delete <strong className="text-text-primary">{pageTitle}</strong>?
          This cannot be undone.
        </Text>

        {impact.isPending ? (
          <Skeleton height={92} radius="sm" />
        ) : facts ? (
          <Alert
            variant="light"
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            title="What this breaks"
          >
            <List size="sm" spacing={2}>
              <List.Item>
                {facts.linkedFromCapped
                  ? `More than ${facts.linkedFromCount} pages link here`
                  : `${plural(facts.linkedFromCount, "page")} link${
                      facts.linkedFromCount === 1 ? "s" : ""
                    } here`}
              </List.Item>
              <List.Item>
                {plural(facts.subpageCount, "sub-page")} become
                {facts.subpageCount === 1 ? "s" : ""} top-level
              </List.Item>
              <List.Item>
                {facts.isPublic
                  ? "Its public URL stops resolving"
                  : "No public URL is affected"}
              </List.Item>
            </List>
            {/* Both counts carry the caller's view filter, so a page in a
                project this user can't see is real but uncounted. Say so
                rather than overstate the numbers' authority. */}
            <Text size="xs" mt={6} className="text-text-muted">
              Counted across the pages you can see.
            </Text>
          </Alert>
        ) : (
          <Alert
            variant="light"
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Could not work out what this breaks"
          >
            <Text size="sm">
              {impact.error?.message ??
                "The impact check failed, so deleting is blocked. Close this and try again."}
            </Text>
          </Alert>
        )}

        <TextInput
          label="Type the page title to confirm"
          placeholder={pageTitle}
          value={confirmation}
          onChange={(e) => setConfirmation(e.currentTarget.value)}
          autoComplete="off"
          data-autofocus
        />

        {deletePage.error ? (
          <Text size="sm" c="red">
            {deletePage.error.message}
          </Text>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!canDelete}
            loading={deletePage.isPending}
            onClick={() => deletePage.mutate({ id: pageId })}
          >
            Delete page
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
