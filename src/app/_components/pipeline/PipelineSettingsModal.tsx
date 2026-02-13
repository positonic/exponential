"use client";

import { useState } from "react";
import {
  Modal,
  TextInput,
  Select,
  Button,
  Group,
  Stack,
  ActionIcon,
  Text,
  Paper,
  Divider,
} from "@mantine/core";
import {
  IconGripVertical,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  type: string;
  _count?: { deals: number };
}

interface PipelineSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  stages: PipelineStage[];
}

const COLOR_OPTIONS = [
  { value: "gray", label: "Gray" },
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "teal", label: "Teal" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "red", label: "Red" },
  { value: "violet", label: "Violet" },
  { value: "pink", label: "Pink" },
];

const TYPE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "won", label: "Won (terminal)" },
  { value: "lost", label: "Lost (terminal)" },
];

export function PipelineSettingsModal({
  opened,
  onClose,
  projectId,
  stages: _initialStages,
}: PipelineSettingsModalProps) {
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("blue");

  const utils = api.useUtils();

  const { data: stages } = api.pipeline.getStages.useQuery(
    { projectId },
    { enabled: opened },
  );

  const createStageMutation = api.pipeline.createStage.useMutation({
    onSuccess: () => {
      setNewStageName("");
      void utils.pipeline.getStages.invalidate({ projectId });
      void utils.pipeline.getOrCreate.invalidate();
      notifications.show({
        title: "Stage added",
        message: "New pipeline stage created",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to create stage",
        color: "red",
      });
    },
  });

  const updateStageMutation = api.pipeline.updateStage.useMutation({
    onSuccess: () => {
      void utils.pipeline.getStages.invalidate({ projectId });
      void utils.pipeline.getOrCreate.invalidate();
    },
  });

  const deleteStageMutation = api.pipeline.deleteStage.useMutation({
    onSuccess: () => {
      void utils.pipeline.getStages.invalidate({ projectId });
      void utils.pipeline.getOrCreate.invalidate();
      void utils.pipeline.getDeals.invalidate({ projectId });
      notifications.show({
        title: "Stage deleted",
        message: "Pipeline stage removed",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to delete stage",
        color: "red",
      });
    },
  });

  function handleAddStage() {
    if (!newStageName.trim()) return;
    // Insert before terminal stages (won/lost), or at end
    const activeStages = (stages ?? []).filter((s) => s.type === "active");
    const insertOrder = activeStages.length;

    createStageMutation.mutate({
      projectId,
      name: newStageName.trim(),
      color: newStageColor,
      type: "active",
      order: insertOrder,
    });
  }

  function handleDeleteStage(stage: PipelineStage) {
    const dealCount = stage._count?.deals ?? 0;
    if (dealCount > 0) {
      // Move deals to the first available stage that isn't this one
      const targetStage = (stages ?? []).find(
        (s) => s.id !== stage.id && s.type === "active",
      );
      if (!targetStage) {
        notifications.show({
          title: "Cannot delete",
          message: "No other active stage to move deals to",
          color: "red",
        });
        return;
      }
      deleteStageMutation.mutate({
        id: stage.id,
        moveDealsToStageId: targetStage.id,
      });
    } else {
      deleteStageMutation.mutate({ id: stage.id });
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Pipeline Settings"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" className="text-text-secondary">
          Configure your pipeline stages. Deals move through these stages from
          left to right on the Kanban board.
        </Text>

        {/* Existing stages */}
        <Stack gap="xs">
          {(stages ?? []).map((stage) => (
            <Paper key={stage.id} p="sm" radius="md" withBorder>
              <Group justify="space-between">
                <Group gap="sm">
                  <IconGripVertical
                    size={16}
                    className="cursor-grab text-text-muted"
                  />
                  <TextInput
                    size="xs"
                    defaultValue={stage.name}
                    onBlur={(e) => {
                      const newName = e.currentTarget.value.trim();
                      if (newName && newName !== stage.name) {
                        updateStageMutation.mutate({
                          id: stage.id,
                          name: newName,
                        });
                      }
                    }}
                    styles={{ input: { width: 150 } }}
                  />
                  <Select
                    size="xs"
                    data={COLOR_OPTIONS}
                    value={stage.color}
                    onChange={(val) =>
                      val &&
                      updateStageMutation.mutate({
                        id: stage.id,
                        color: val,
                      })
                    }
                    styles={{ input: { width: 100 } }}
                  />
                  <Select
                    size="xs"
                    data={TYPE_OPTIONS}
                    value={stage.type}
                    onChange={(val) =>
                      val &&
                      updateStageMutation.mutate({
                        id: stage.id,
                        type: val as "active" | "won" | "lost",
                      })
                    }
                    styles={{ input: { width: 130 } }}
                  />
                </Group>
                <Group gap="xs">
                  {(stage._count?.deals ?? 0) > 0 && (
                    <Text size="xs" className="text-text-muted">
                      {stage._count?.deals} deals
                    </Text>
                  )}
                  <ActionIcon
                    variant="light"
                    color="red"
                    size="sm"
                    onClick={() => handleDeleteStage(stage)}
                    loading={deleteStageMutation.isPending}
                    disabled={(stages ?? []).length <= 2}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>

        {/* Add new stage */}
        <Divider />
        <Text size="sm" fw={500}>
          Add Stage
        </Text>
        <Group>
          <TextInput
            placeholder="Stage name"
            value={newStageName}
            onChange={(e) => setNewStageName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
            className="flex-1"
          />
          <Select
            data={COLOR_OPTIONS}
            value={newStageColor}
            onChange={(val) => val && setNewStageColor(val)}
            styles={{ input: { width: 100 } }}
          />
          <Button
            leftSection={<IconPlus size={14} />}
            onClick={handleAddStage}
            loading={createStageMutation.isPending}
            disabled={!newStageName.trim()}
          >
            Add
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
