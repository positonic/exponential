"use client";

import { useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Select,
  Stack,
  Button,
  Group,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CreateListModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreated?: () => void;
}

export function CreateListModal({
  opened,
  onClose,
  workspaceId,
  onCreated,
}: CreateListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [listType, setListType] = useState<string>("CUSTOM");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const createMutation = api.list.create.useMutation({
    onSuccess: (list) => {
      notifications.show({
        title: "List Created",
        message: `"${list.name}" has been created`,
        color: "green",
      });
      onCreated?.();
      handleClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to create list",
        color: "red",
      });
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setListType("CUSTOM");
    setStartDate(null);
    setEndDate(null);
    onClose();
  };

  const handleCreate = () => {
    const slug = toSlug(name);
    if (!slug) return;

    createMutation.mutate({
      workspaceId,
      name: name.trim(),
      slug,
      description: description.trim() || undefined,
      listType: listType as "SPRINT" | "BACKLOG" | "CUSTOM",
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    });
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create List" size={listType === "SPRINT" ? "xl" : "md"}>
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="e.g., Sprint 1, Product Backlog"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          data-autofocus
        />

        <Select
          label="Type"
          data={[
            { value: "CUSTOM", label: "Custom" },
            { value: "SPRINT", label: "Sprint" },
            { value: "BACKLOG", label: "Backlog" },
          ]}
          value={listType}
          onChange={(value) => { if (value) setListType(value); }}
        />

        {listType === "SPRINT" && (
          <Group grow align="flex-start">
            <Stack gap={4}>
              <span className="text-sm font-medium text-text-primary">Start date</span>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
              />
            </Stack>
            <Stack gap={4}>
              <span className="text-sm font-medium text-text-primary">End date</span>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
              />
            </Stack>
          </Group>
        )}

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
            onClick={handleCreate}
            loading={createMutation.isPending}
            disabled={!name.trim() || !toSlug(name)}
          >
            Create List
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
