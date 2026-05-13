"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { api } from "~/trpc/react";
import { TagSelector } from "~/app/_components/TagSelector";

const STATUS_OPTIONS = [
  { value: "IDEA", label: "Idea" },
  { value: "DEFINED", label: "Defined" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "ARCHIVED", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

interface EditFeatureModalProps {
  opened: boolean;
  onClose: () => void;
  featureId: string;
  workspaceId?: string;
}

type FeatureStatus = "IDEA" | "DEFINED" | "IN_PROGRESS" | "SHIPPED" | "ARCHIVED";

const inputStyles = {
  input: {
    backgroundColor: "var(--color-surface-secondary)",
    color: "var(--color-text-primary)",
    borderColor: "var(--color-border-primary)",
  },
};

export function EditFeatureModal({
  opened,
  onClose,
  featureId,
  workspaceId,
}: EditFeatureModalProps) {
  const utils = api.useUtils();

  const featureQuery = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: opened },
  );
  const tagsQuery = api.tag.listForEntity.useQuery(
    { entityType: "feature", entityId: featureId },
    { enabled: opened },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vision, setVision] = useState("");
  const [status, setStatus] = useState<FeatureStatus>("IDEA");
  const [priority, setPriority] = useState<string | null>(null);
  const [effort, setEffort] = useState<number | "">("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    const feature = featureQuery.data;
    if (!feature) return;
    setName(feature.name);
    setDescription(feature.description ?? "");
    setVision(feature.vision ?? "");
    setStatus(feature.status as FeatureStatus);
    setPriority(feature.priority != null ? String(feature.priority) : null);
    setEffort(feature.effort ?? "");
  }, [opened, featureQuery.data]);

  useEffect(() => {
    if (!opened) return;
    const loaded = tagsQuery.data;
    if (loaded) setTagIds(loaded.map((t) => t.id));
  }, [opened, tagsQuery.data]);

  const updateFeature = api.product.feature.update.useMutation();
  const setEntityTags = api.tag.setEntityTags.useMutation();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await updateFeature.mutateAsync({
        id: featureId,
        name: name.trim(),
        description: description.trim() || undefined,
        vision: vision.trim() || undefined,
        status,
        priority: priority != null ? Number(priority) : undefined,
        effort: typeof effort === "number" ? effort : undefined,
      });
      await setEntityTags.mutateAsync({
        entityType: "feature",
        entityId: featureId,
        tagIds,
      });
      await utils.product.feature.list.invalidate();
      await utils.product.feature.getById.invalidate({ id: featureId });
      await utils.tag.listForEntity.invalidate({
        entityType: "feature",
        entityId: featureId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update feature");
    }
  };

  const isSaving = updateFeature.isPending || setEntityTags.isPending;
  const isLoading = featureQuery.isLoading || tagsQuery.isLoading;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Feature"
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
          placeholder="Feature name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          styles={inputStyles}
          disabled={isLoading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="What is this feature?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
          styles={inputStyles}
        />
        <Textarea
          label="Vision"
          placeholder="Why does this feature exist?"
          value={vision}
          onChange={(e) => setVision(e.currentTarget.value)}
          rows={2}
          styles={inputStyles}
        />
        <Group grow>
          <Select
            label="Status"
            value={status}
            onChange={(val) => setStatus((val ?? "IDEA") as FeatureStatus)}
            data={STATUS_OPTIONS}
            styles={inputStyles}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={(val) => setPriority(val)}
            data={PRIORITY_OPTIONS}
            clearable
            styles={inputStyles}
          />
        </Group>
        <NumberInput
          label="Effort"
          placeholder="Story points or hours"
          value={effort}
          onChange={(val) => setEffort(typeof val === "number" ? val : "")}
          allowDecimal
          styles={inputStyles}
        />
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
