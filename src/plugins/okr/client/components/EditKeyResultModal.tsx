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
import { useState, useEffect, useMemo } from "react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { KeyResultGuidanceIcon } from "./KeyResultGuidance";

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
  userId?: string;
  driUserId?: string | null;
}

type EditKeyResultModalProps = {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  variant?: "default" | "review";
} & (
  | {
      mode?: "edit";
      keyResult: KeyResultData | null;
      goalId?: never;
      period?: never;
      workspaceId?: never;
      defaultDriUserId?: never;
      initialProjectIds?: never;
    }
  | {
      mode: "create";
      keyResult?: null;
      goalId: number;
      period: string;
      workspaceId?: string;
      defaultDriUserId?: string | null;
      initialProjectIds?: string[];
    }
);

export function EditKeyResultModal({
  keyResult,
  opened,
  onClose,
  onSuccess,
  mode = "edit",
  variant = "default",
  goalId,
  period: createPeriod,
  workspaceId: createWorkspaceId,
  defaultDriUserId,
  initialProjectIds,
}: EditKeyResultModalProps) {
  const isCreate = mode === "create";
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
  const [driUserId, setDriUserId] = useState<string | null>(null);

  const utils = api.useUtils();
  const { workspace } = useWorkspace();
  const { data: currentUser } = api.user.getCurrentUser.useQuery();

  // Fetch available projects for the workspace
  const { data: availableProjects = [] } = api.project.getAll.useQuery(
    { workspaceId: workspace?.id ?? createWorkspaceId },
    { enabled: opened && !!(workspace?.id ?? createWorkspaceId) }
  );

  // Query to get fresh key result data (edit mode only)
  const { data: freshKeyResult } = api.okr.getById.useQuery(
    { id: keyResult?.id ?? "" },
    { enabled: !isCreate && !!keyResult?.id && opened }
  );

  // Use fresh data if available, fallback to prop
  const currentKeyResult = freshKeyResult ?? keyResult;

  // Reset form fields to defaults (used for create mode + when modal opens)
  const resetCreateDefaults = () => {
    setTitle("");
    setDescription("");
    setTargetValue(100);
    setCurrentValue(0);
    setStartValue(0);
    setUnit("percent");
    setUnitLabel("");
    setStatus("on-track");
    setConfidence(null);
    setSelectedProjectIds(initialProjectIds ?? []);
    setDriUserId(defaultDriUserId ?? currentUser?.id ?? null);
  };

  // Populate form when key result changes (edit) or reset (create)
  useEffect(() => {
    if (isCreate) {
      if (opened) resetCreateDefaults();
      return;
    }
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
      setDriUserId(
        currentKeyResult.driUserId ??
          currentKeyResult.userId ??
          currentUser?.id ??
          null
      );

      // Populate selected projects from freshKeyResult if available
      const linkedProjectIds =
        (freshKeyResult as { projects?: Array<{ project: { id: string } }> })
          ?.projects?.map((p) => p.project.id) ?? [];
      setSelectedProjectIds(linkedProjectIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKeyResult, currentUser?.id, freshKeyResult, isCreate, opened]);

  const driOptions = useMemo(() => {
    const members = workspace?.members ?? [];
    const optionMap = new Map<string, { value: string; label: string }>();

    members.forEach((member) => {
      const label = member.user.name ?? member.user.email ?? "Unknown User";
      optionMap.set(member.user.id, { value: member.user.id, label });
    });

    if (currentUser) {
      const label = currentUser.name ?? currentUser.email ?? "Me";
      optionMap.set(currentUser.id, { value: currentUser.id, label });
    }

    return Array.from(optionMap.values());
  }, [currentUser, workspace?.members]);

  useEffect(() => {
    if (driOptions.length === 0) return;
    if (!driUserId || !driOptions.some((option) => option.value === driUserId)) {
      setDriUserId(driOptions[0]?.value ?? null);
    }
  }, [driOptions, driUserId]);

  // Update mutation
  const updateKeyResult = api.okr.update.useMutation({
    onSuccess: async () => {
      await utils.okr.getByObjective.invalidate();
      await utils.okr.getStats.invalidate();
      await utils.okr.getAll.invalidate();
      await utils.okr.getById.invalidate();
    },
  });

  // Create mutation
  const createKeyResult = api.okr.create.useMutation({
    onSuccess: async () => {
      await utils.okr.getByObjective.invalidate();
      await utils.okr.getStats.invalidate();
      await utils.okr.getAll.invalidate();
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
    if (!title) return;

    try {
      if (isCreate) {
        if (goalId == null || !createPeriod) return;
        const created = await createKeyResult.mutateAsync({
          goalId,
          title,
          description: description || undefined,
          targetValue,
          startValue,
          currentValue,
          unit,
          unitLabel: unit === "custom" ? unitLabel : undefined,
          period: createPeriod,
          driUserId: driUserId ?? undefined,
          workspaceId: createWorkspaceId,
        });

        if (selectedProjectIds.length > 0) {
          await updateLinkedProjects.mutateAsync({
            keyResultId: created.id,
            projectIds: selectedProjectIds,
          });
        }

        onSuccess?.();
        onClose();
        return;
      }

      if (!currentKeyResult) return;

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
        driUserId: driUserId ?? currentUser?.id,
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
      console.error("Failed to save key result:", error);
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

  const isReview = variant === "review";

  // Token map: in 'review' variant, swap to portfolio-review tokens so the
  // modal blends with the weekly-review surface. The `pr-modal-surface`
  // class (defined in globals.css) re-declares `--pr-*` outside the
  // surface element so they resolve inside the Mantine Portal.
  const bgElevated = isReview
    ? "var(--pr-bg-elevated)"
    : "var(--color-bg-elevated)";
  const bgInput = isReview
    ? "var(--pr-surface-muted)"
    : "var(--color-bg-input)";
  const textPrimary = isReview
    ? "var(--pr-text-primary)"
    : "var(--color-text-primary)";
  const textSecondary = isReview
    ? "var(--pr-text-secondary)"
    : "var(--color-text-secondary)";
  const borderPrimary = isReview
    ? "var(--pr-border-subtle)"
    : "var(--color-border-primary)";

  const inputStyles = {
    input: {
      backgroundColor: bgInput,
      borderColor: borderPrimary,
      color: textPrimary,
    },
    label: {
      color: textSecondary,
    },
  };
  const selectStyles = {
    ...inputStyles,
    dropdown: {
      backgroundColor: bgElevated,
      borderColor: borderPrimary,
    },
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="md"
      classNames={isReview ? { content: "pr-modal-surface", header: "pr-modal-surface" } : undefined}
      title={
        <Text fw={600} size="lg">
          {isCreate ? "Create Key Result" : "Edit Key Result"}
        </Text>
      }
      styles={{
        content: {
          backgroundColor: bgElevated,
          color: textPrimary,
        },
        header: {
          backgroundColor: bgElevated,
          borderBottom: `1px solid ${borderPrimary}`,
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
            label={
              <Group gap={4} align="center" component="span">
                <span>Title</span>
                <KeyResultGuidanceIcon />
              </Group>
            }
            placeholder="What do you want to achieve?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
            styles={inputStyles}
          />

          <Select
            label="DRI"
            description="Directly responsible individual"
            placeholder="Select a DRI"
            data={driOptions}
            value={driUserId}
            onChange={(value) => setDriUserId(value ?? null)}
            required
            styles={selectStyles}
          />

          {/* Description */}
          <Textarea
            label="Description"
            placeholder="Add more details about this key result..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={2}
            styles={inputStyles}
          />

          <Divider label="Progress Tracking" labelPosition="center" />

          {/* Values row */}
          <Group grow>
            <NumberInput
              label="Start Value"
              value={startValue}
              onChange={(val) => setStartValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
            />
            <NumberInput
              label="Current Value"
              value={currentValue}
              onChange={(val) => setCurrentValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
            />
            <NumberInput
              label="Target Value"
              value={targetValue}
              onChange={(val) => setTargetValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
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
              styles={selectStyles}
            />
            {unit === "custom" && (
              <TextInput
                label="Custom Unit Label"
                placeholder="e.g., users, tasks, etc."
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.currentTarget.value)}
                styles={inputStyles}
              />
            )}
          </Group>

          {!isCreate && (
            <>
              <Divider label="Status & Confidence" labelPosition="center" />

              {/* Status and confidence */}
              <Group grow>
                <Select
                  label="Status"
                  data={statusOptions}
                  value={status}
                  onChange={(val) =>
                    setStatus((val as StatusType) ?? "on-track")
                  }
                  styles={selectStyles}
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
                  styles={inputStyles}
                />
              </Group>
            </>
          )}

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
            styles={selectStyles}
          />

          {/* Actions */}
          <Group justify="space-between" mt="lg">
            {isCreate ? (
              <span />
            ) : (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
                loading={deleteKeyResult.isPending}
              >
                Delete
              </Button>
            )}
            <Group>
              <Button variant="subtle" color="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={
                  updateKeyResult.isPending ||
                  createKeyResult.isPending ||
                  updateLinkedProjects.isPending
                }
                disabled={!title}
              >
                {isCreate ? "Create Key Result" : "Save Changes"}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
