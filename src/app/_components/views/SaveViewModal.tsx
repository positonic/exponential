"use client";

import { useState } from "react";
import { Modal, TextInput, Textarea, Stack, Button, Group } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import type { ViewFilters, ViewType, ViewGroupBy } from "~/types/view";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

interface SaveViewModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  currentFilters: ViewFilters;
  currentViewType: ViewType;
  currentGroupBy: ViewGroupBy;
  onSaved: (view: {
    id: string;
    name: string;
    viewType: string;
    groupBy: string;
    filters: unknown;
  }) => void;
}

export function SaveViewModal({
  opened,
  onClose,
  workspaceId,
  currentFilters,
  currentViewType,
  currentGroupBy,
  onSaved,
}: SaveViewModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = api.view.create.useMutation({
    onSuccess: (view) => {
      notifications.show({
        title: "View Saved",
        message: `"${view.name}" has been created`,
        color: "green",
      });
      onSaved(view);
      handleClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to save view",
        color: "red",
      });
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    onClose();
  };

  const handleSave = () => {
    const slug = toSlug(name);
    if (!slug) return;

    createMutation.mutate({
      workspaceId,
      name: name.trim(),
      slug,
      description: description.trim() || undefined,
      viewType: currentViewType,
      groupBy: currentGroupBy,
      filters: currentFilters,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Save as View"
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label="View name"
          placeholder="e.g., Sprint 1, In Progress, High Priority"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          data-autofocus
        />

        <Textarea
          label="Description"
          placeholder="Optional description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          maxRows={3}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={createMutation.isPending}
            disabled={!name.trim() || !toSlug(name)}
          >
            Save View
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
