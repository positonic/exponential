"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  Stack,
  Text,
  Divider,
  MultiSelect,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

// Unit options for key results
const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

// Status options for key results
const statusOptions = [
  { value: "not-started", label: "Not Started" },
  { value: "on-track", label: "On Track" },
  { value: "at-risk", label: "At Risk" },
  { value: "off-track", label: "Off Track" },
  { value: "achieved", label: "Achieved" },
];

type UnitType = "percent" | "count" | "currency" | "hours" | "custom";
type StatusType = "not-started" | "on-track" | "at-risk" | "off-track" | "achieved";

interface KeyResultData {
  id: string;
  title: string;
  description?: string | null;
  currentValue: number;
  targetValue: number;
  startValue: number;
  unit?: string;
  unitLabel?: string | null;
  status: string;
  confidence?: number | null;
  period?: string;
}

interface EditKeyResultModalProps {
  keyResult: KeyResultData | null;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditKeyResultModal({
  keyResult,
  opened,
  onClose,
  onSuccess,
}: EditKeyResultModalProps) {
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState<number>(100);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [startValue, setStartValue] = useState<number>(0);
  const [unit, setUnit] = useState<UnitType>("percent");
  const [unitLabel, setUnitLabel] = useState("");
  const [status, setStatus] = useState<StatusType>("on-track");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const utils = api.useUtils();
  const { workspace } = useWorkspace();

  // Fetch available projects for the workspace
  const { data: availableProjects = [] } = api.project.getAll.useQuery(
    { workspaceId: workspace?.id },
    { enabled: opened && !!workspace }
  );

  // Query to get fresh key result data
  const { data: freshKeyResult } = api.okr.getById.useQuery(
    { id: keyResult?.id ?? "" },
    { enabled: !!keyResult?.id && opened }
  );

  // Use fresh data if available, fallback to prop
  const currentKeyResult = freshKeyResult ?? keyResult;

  // Populate form when key result changes
  useEffect(() => {
    if (currentKeyResult) {
      setTitle(currentKeyResult.title);
      setDescription(currentKeyResult.description ?? "");
      setTargetValue(currentKeyResult.targetValue);
      setCurrentValue(currentKeyResult.currentValue);
      setStartValue(currentKeyResult.startValue);
      setUnit((currentKeyResult.unit as UnitType) ?? "percent");
      setUnitLabel(currentKeyResult.unitLabel ?? "");
      setStatus((currentKeyResult.status as StatusType) ?? "on-track");
      setConfidence(currentKeyResult.confidence ?? null);

      // Populate selected projects from freshKeyResult if available
      const linkedProjectIds =
        (freshKeyResult as { projects?: Array<{ project: { id: string } }> })
          ?.projects?.map((p) => p.project.id) ?? [];
      setSelectedProjectIds(linkedProjectIds);
    }
  }, [currentKeyResult, freshKeyResult]);

  // Update mutation
  const updateKeyResult = api.okr.update.useMutation({
    onSuccess: async () => {
      await utils.okr.getByObjective.invalidate();
      await utils.okr.getStats.invalidate();
      await utils.okr.getAll.invalidate();
      await utils.okr.getById.invalidate();
    },
  });

  // Update linked projects mutation
  const updateLinkedProjects = api.okr.updateLinkedProjects.useMutation({
    onSuccess: async () => {
      await utils.okr.getByObjective.invalidate();
      await utils.okr.getById.invalidate();
    },
  });

  // Delete mutation
  const deleteKeyResult = api.okr.delete.useMutation({
    onSuccess: async () => {
      await utils.okr.getByObjective.invalidate();
      await utils.okr.getStats.invalidate();
      await utils.okr.getAll.invalidate();
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = async () => {
    if (!title || !currentKeyResult) return;

    try {
      // Save key result fields
      await updateKeyResult.mutateAsync({
        id: currentKeyResult.id,
        title,
        description: description || undefined,
        targetValue,
        currentValue,
        startValue,
        unit,
        unitLabel: unit === "custom" ? unitLabel : undefined,
        status,
        confidence: confidence ?? undefined,
      });

      // Save linked projects
      await updateLinkedProjects.mutateAsync({
        keyResultId: currentKeyResult.id,
        projectIds: selectedProjectIds,
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      // Error is handled by mutation hooks
      console.error("Failed to update key result:", error);
    }
  };

  const handleDelete = () => {
    if (!currentKeyResult) return;

    if (window.confirm("Are you sure you want to delete this key result?")) {
      deleteKeyResult.mutate({ id: currentKeyResult.id });
    }
  };

  // Calculate progress percentage
  const range = targetValue - startValue;
  const progressPercent =
    range > 0 ? Math.round(((currentValue - startValue) / range) * 100) : 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="md"
      title={
        <Text fw={600} size="lg">
          Edit Key Result
        </Text>
      }
      styles={{
        content: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        },
        header: {
          backgroundColor: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border-primary)",
        },
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <Stack gap="md" p="md">
          {/* Title */}
          <TextInput
            label="Title"
            placeholder="What do you want to achieve?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
            styles={{
              input: {
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-primary)",
                color: "var(--color-text-primary)",
              },
              label: {
                color: "var(--color-text-secondary)",
              },
            }}
          />

          {/* Description */}
          <Textarea
            label="Description"
            placeholder="Add more details about this key result..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={2}
            styles={{
              input: {
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-primary)",
                color: "var(--color-text-primary)",
              },
              label: {
                color: "var(--color-text-secondary)",
              },
            }}
          />

          <Divider label="Progress Tracking" labelPosition="center" />

          {/* Values row */}
          <Group grow>
            <NumberInput
              label="Start Value"
              value={startValue}
              onChange={(val) => setStartValue(Number(val) || 0)}
              min={0}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
              }}
            />
            <NumberInput
              label="Current Value"
              value={currentValue}
              onChange={(val) => setCurrentValue(Number(val) || 0)}
              min={0}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
              }}
            />
            <NumberInput
              label="Target Value"
              value={targetValue}
              onChange={(val) => setTargetValue(Number(val) || 0)}
              min={0}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
              }}
            />
          </Group>

          {/* Progress display */}
          <Text size="sm" c="dimmed" ta="center">
            Progress: {progressPercent}% ({currentValue} / {targetValue})
          </Text>

          {/* Unit selection */}
          <Group grow>
            <Select
              label="Unit"
              data={unitOptions}
              value={unit}
              onChange={(val) => setUnit((val as UnitType) ?? "percent")}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
                dropdown: {
                  backgroundColor: "var(--color-bg-elevated)",
                  borderColor: "var(--color-border-primary)",
                },
              }}
            />
            {unit === "custom" && (
              <TextInput
                label="Custom Unit Label"
                placeholder="e.g., users, tasks, etc."
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.currentTarget.value)}
                styles={{
                  input: {
                    backgroundColor: "var(--color-bg-input)",
                    borderColor: "var(--color-border-primary)",
                    color: "var(--color-text-primary)",
                  },
                  label: {
                    color: "var(--color-text-secondary)",
                  },
                }}
              />
            )}
          </Group>

          <Divider label="Status & Confidence" labelPosition="center" />

          {/* Status and confidence */}
          <Group grow>
            <Select
              label="Status"
              data={statusOptions}
              value={status}
              onChange={(val) => setStatus((val as StatusType) ?? "on-track")}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
                dropdown: {
                  backgroundColor: "var(--color-bg-elevated)",
                  borderColor: "var(--color-border-primary)",
                },
              }}
            />
            <NumberInput
              label="Confidence (%)"
              placeholder="How confident are you?"
              value={confidence ?? ""}
              onChange={(val) =>
                setConfidence(val === "" ? null : Number(val))
              }
              min={0}
              max={100}
              styles={{
                input: {
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                },
                label: {
                  color: "var(--color-text-secondary)",
                },
              }}
            />
          </Group>

          <Divider label="Linked Projects" labelPosition="center" />

          {/* Project Selection */}
          <MultiSelect
            label="Projects"
            description="Select projects that contribute to this key result"
            placeholder="Choose projects..."
            data={availableProjects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.status})`,
            }))}
            value={selectedProjectIds}
            onChange={setSelectedProjectIds}
            searchable
            clearable
            styles={{
              input: {
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-primary)",
                color: "var(--color-text-primary)",
              },
              label: {
                color: "var(--color-text-secondary)",
              },
              dropdown: {
                backgroundColor: "var(--color-bg-elevated)",
                borderColor: "var(--color-border-primary)",
              },
            }}
          />

          {/* Actions */}
          <Group justify="space-between" mt="lg">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={handleDelete}
              loading={deleteKeyResult.isPending}
            >
              Delete
            </Button>
            <Group>
              <Button variant="subtle" color="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={updateKeyResult.isPending || updateLinkedProjects.isPending}
                disabled={!title}
              >
                Save Changes
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
