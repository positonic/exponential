"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { usePageProjectPlacement } from "~/app/_components/pages/PageProjectPicker";

/** The sentinel for "no project": Mantine's Select can't carry a null value. */
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
 * "Move to project…" from the Page actions menu: re-place a page under another
 * project of its workspace, or detach it to workspace level.
 *
 * It is the same placement the picker under the title makes, through the same
 * hook ({@link usePageProjectPlacement}): candidates are the projects the
 * caller can **edit** (placement decides who can see the page, ADR-0033), and
 * "No project" is offered only to workspace members, the rule the server's
 * placement gate applies. The server re-checks on `page.update`, so this list
 * is the affordance, not the guard. Moving to another workspace stays in Page
 * details ("Move…" beside the title).
 */
export function PageMoveDialog({
  pageId,
  workspaceId,
  projectId,
  opened,
  onClose,
}: PageMoveDialogProps) {
  const placement = usePageProjectPlacement(pageId, workspaceId);
  const [selected, setSelected] = useState<string>(projectId ?? NO_PROJECT);
  const { loadOptions } = placement;

  // Reopening shows the current placement, not the last abandoned choice, and
  // loads the candidates on first open (most page views never re-place).
  useEffect(() => {
    if (!opened) return;
    setSelected(projectId ?? NO_PROJECT);
    loadOptions();
  }, [opened, projectId, loadOptions]);

  const options = [
    ...(placement.canDetach || projectId === null
      ? [{ value: NO_PROJECT, label: "No project" }]
      : []),
    ...placement.options.map((p) => ({ value: p.id, label: p.name })),
  ];
  const current = projectId ?? NO_PROJECT;

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
          onChange={(value) => setSelected(value ?? current)}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No projects you can edit"
          disabled={placement.isLoading}
          comboboxProps={{ withinPortal: true }}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={placement.isPending}
            disabled={selected === current}
            onClick={() =>
              placement.move(selected === NO_PROJECT ? null : selected, projectId, {
                onSuccess: onClose,
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
