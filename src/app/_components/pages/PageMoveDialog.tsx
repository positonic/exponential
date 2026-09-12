"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

/** The sentinel for "no project" — Mantine's Select can't carry a null value. */
const NO_PROJECT = "__none__";

interface PageMoveDialogProps {
  pageId: string;
  workspaceId: string;
  /** Current placement; null means the page sits at workspace level. */
  projectId: string | null;
  opened: boolean;
  onClose: () => void;
}

/**
 * "Move to project…" — re-places a page under a project, or detaches it back
 * to the workspace.
 *
 * Placement decides who can see the page (ADR-0033: project access is
 * authoritative for a project-linked page), so the candidates are the projects
 * the caller can **edit**, not merely view — `project.getAssignable`, the same
 * list meeting placement uses. The server re-runs its own placement gating on
 * `page.update`, so this list is the affordance, not the guard.
 */
export function PageMoveDialog({
  pageId,
  workspaceId,
  projectId,
  opened,
  onClose,
}: PageMoveDialogProps) {
  const [selected, setSelected] = useState<string>(projectId ?? NO_PROJECT);
  const utils = api.useUtils();

  // Reopen shows the current placement, not the last abandoned choice.
  useEffect(() => {
    if (opened) setSelected(projectId ?? NO_PROJECT);
  }, [opened, projectId]);

  const assignable = api.project.getAssignable.useQuery(undefined, {
    enabled: opened,
  });

  const move = api.page.update.useMutation({
    onSuccess: () => {
      void utils.page.get.invalidate({ id: pageId });
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      onClose();
    },
    onError: (error) =>
      notifications.show({
        color: "red",
        title: "Could not move the page",
        message: error.message,
      }),
  });

  const options = [
    { value: NO_PROJECT, label: "No project" },
    ...(assignable.data ?? [])
      .filter((p) => p.workspaceId === workspaceId)
      .map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Modal opened={opened} onClose={onClose} title="Move to project" centered>
      <Stack gap="md">
        <Text size="sm" className="text-text-secondary">
          A page in a project is visible to everyone who can see that project.
          Without one it stays at workspace level.
        </Text>
        <Select
          label="Project"
          data={options}
          value={selected}
          onChange={(value) => setSelected(value ?? NO_PROJECT)}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No projects you can edit"
          disabled={assignable.isLoading}
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={move.isPending}
            disabled={selected === (projectId ?? NO_PROJECT)}
            onClick={() =>
              move.mutate({
                id: pageId,
                projectId: selected === NO_PROJECT ? null : selected,
              })
            }
          >
            Move
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
