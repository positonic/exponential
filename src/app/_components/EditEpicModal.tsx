"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { api } from "~/trpc/react";
import { EPIC_PRIORITY_OPTIONS, EPIC_STATUS_OPTIONS } from "~/types/epic";
import type { EpicPriority, EpicStatus } from "~/types/epic";
import { TagSelector } from "~/app/_components/TagSelector";

interface EditEpicModalProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  workspaceId?: string;
}

const inputStyles = {
  input: {
    backgroundColor: "var(--color-surface-secondary)",
    color: "var(--color-text-primary)",
    borderColor: "var(--color-border-primary)",
  },
};

export function EditEpicModal({
  opened,
  onClose,
  epicId,
  workspaceId,
}: EditEpicModalProps) {
  const utils = api.useUtils();

  const epicQuery = api.epic.getById.useQuery(
    { id: epicId },
    { enabled: opened },
  );
  const tagsQuery = api.tag.listForEntity.useQuery(
    { entityType: "epic", entityId: epicId },
    { enabled: opened },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EpicStatus>("OPEN");
  const [priority, setPriority] = useState<EpicPriority>("MEDIUM");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    const epic = epicQuery.data;
    if (!epic) return;
    setName(epic.name);
    setDescription(epic.description ?? "");
    setStatus(epic.status as EpicStatus);
    setPriority(epic.priority as EpicPriority);
    setStartDate(epic.startDate ? new Date(epic.startDate) : null);
    setTargetDate(epic.targetDate ? new Date(epic.targetDate) : null);
  }, [opened, epicQuery.data]);

  useEffect(() => {
    if (!opened) return;
    const loaded = tagsQuery.data;
    if (loaded) setTagIds(loaded.map((t) => t.id));
  }, [opened, tagsQuery.data]);

  const updateEpic = api.epic.update.useMutation();
  const setEntityTags = api.tag.setEntityTags.useMutation();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await updateEpic.mutateAsync({
        id: epicId,
        name: name.trim(),
        description: description.trim() || null,
        status,
        priority,
        startDate,
        targetDate,
      });
      await setEntityTags.mutateAsync({
        entityType: "epic",
        entityId: epicId,
        tagIds,
      });
      await utils.epic.list.invalidate();
      await utils.epic.getById.invalidate({ id: epicId });
      await utils.tag.listForEntity.invalidate({
        entityType: "epic",
        entityId: epicId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update epic");
    }
  };

  const isSaving = updateEpic.isPending || setEntityTags.isPending;
  const isLoading = epicQuery.isLoading || tagsQuery.isLoading;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Epic"
      size="md"
      styles={{
        content: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        },
        header: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        },
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Epic name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          styles={inputStyles}
          disabled={isLoading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="What does this epic cover?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
          styles={inputStyles}
        />
        <Group grow>
          <Select
            label="Status"
            value={status}
            onChange={(val) => setStatus((val ?? "OPEN") as EpicStatus)}
            data={EPIC_STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            styles={inputStyles}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={(val) => setPriority((val ?? "MEDIUM") as EpicPriority)}
            data={EPIC_PRIORITY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            styles={inputStyles}
          />
        </Group>
        <Group grow>
          <DateInput
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
            placeholder="Optional"
            clearable
            styles={inputStyles}
          />
          <DateInput
            label="Target Date"
            value={targetDate}
            onChange={setTargetDate}
            placeholder="Optional"
            clearable
            styles={inputStyles}
          />
        </Group>
        <div>
          <div className="text-xs text-text-secondary mb-1">Labels</div>
          <TagSelector
            selectedTagIds={tagIds}
            onChange={setTagIds}
            workspaceId={workspaceId}
            categoryFilter={null}
          />
        </div>
        {error && (
          <div className="text-xs text-text-error">{error}</div>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSubmit();
            }}
            loading={isSaving}
            disabled={!name.trim() || isLoading}
          >
            Save changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
