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
    { enabled: opened },
  );

  const deletePage = api.page.delete.useMutation({
    onSuccess: () => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      void utils.favorite.list.invalidate();
      onDeleted();
    },
  });

  const titleMatches = confirmation === pageTitle;
  const facts = impact.data;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete page" centered>
      <Stack gap="md">
        <Text size="sm" className="text-text-secondary">
          Delete <strong className="text-text-primary">{pageTitle}</strong>?
          This cannot be undone.
        </Text>

        {impact.isLoading ? (
          <Skeleton height={72} radius="sm" />
        ) : facts ? (
          <Alert
            variant="light"
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            title="What this breaks"
          >
            <List size="sm" spacing={2}>
              <List.Item>
                {plural(facts.linkedFromCount, "page")} link
                {facts.linkedFromCount === 1 ? "s" : ""} here
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
          </Alert>
        ) : null}

        <TextInput
          label="Type the page title to confirm"
          placeholder={pageTitle}
          value={confirmation}
          onChange={(e) => setConfirmation(e.currentTarget.value)}
          error={
            deletePage.error ? deletePage.error.message : undefined
          }
          autoComplete="off"
          data-autofocus
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!titleMatches}
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
