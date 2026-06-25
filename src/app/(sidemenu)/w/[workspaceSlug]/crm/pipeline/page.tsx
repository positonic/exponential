"use client";

import { useState, useEffect } from "react";
import {
  Group,
  Button,
  Text,
  Loader,
  Stack,
  Select,
  Modal,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconSettings } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DealKanbanBoard } from "~/app/_components/pipeline/DealKanbanBoard";
import { CreateDealModal } from "~/app/_components/pipeline/CreateDealModal";
import { DealDetailDrawer } from "~/app/_components/pipeline/DealDetailDrawer";
import { PipelineStats } from "~/app/_components/pipeline/PipelineStats";
import { PipelineSettingsModal } from "~/app/_components/pipeline/PipelineSettingsModal";

export default function PipelinePage() {
  const { workspace, workspaceId } = useWorkspace();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null,
  );
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  const utils = api.useUtils();

  // A workspace may hold N named pipelines (ADR-0033).
  const {
    data: pipelines,
    isLoading: pipelinesLoading,
    error: pipelinesError,
  } = api.pipeline.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );

  const createPipelineMutation = api.pipeline.create.useMutation({
    onSuccess: (created) => {
      setSelectedPipelineId(created.id);
      void utils.pipeline.list.invalidate({ workspaceId: workspaceId! });
    },
  });

  // First-run convenience: seed a default pipeline when the workspace has none.
  useEffect(() => {
    if (
      workspaceId &&
      !pipelinesLoading &&
      !pipelinesError &&
      pipelines?.length === 0 &&
      !createPipelineMutation.isPending &&
      !createPipelineMutation.isSuccess
    ) {
      createPipelineMutation.mutate({ workspaceId });
    }
  }, [
    workspaceId,
    pipelinesLoading,
    pipelinesError,
    pipelines,
    createPipelineMutation,
  ]);

  // Keep a valid pipeline selected: default to the first when none is chosen or
  // the chosen one disappears (e.g. after switching workspaces).
  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return;
    if (!selectedPipelineId || !pipelines.some((p) => p.id === selectedPipelineId)) {
      setSelectedPipelineId(pipelines[0]!.id);
    }
  }, [pipelines, selectedPipelineId]);

  const pipeline =
    pipelines?.find((p) => p.id === selectedPipelineId) ?? pipelines?.[0];

  const { data: deals, isLoading: dealsLoading } =
    api.pipeline.getDeals.useQuery(
      { projectId: pipeline?.id ?? "" },
      { enabled: !!pipeline?.id },
    );

  const { data: stats } = api.pipeline.getStats.useQuery(
    { projectId: pipeline?.id ?? "" },
    { enabled: !!pipeline?.id },
  );

  const handleCreatePipeline = () => {
    const name = newPipelineName.trim();
    if (!name || !workspaceId) return;
    createPipelineMutation.mutate(
      { workspaceId, name },
      {
        onSuccess: () => {
          setNewPipelineOpen(false);
          setNewPipelineName("");
          notifications.show({
            title: "Pipeline created",
            message: `“${name}” is ready. Rename its stages in Settings.`,
            color: "green",
          });
        },
        onError: (error) =>
          notifications.show({
            title: "Could not create pipeline",
            message: error.message,
            color: "red",
          }),
      },
    );
  };

  if (!workspace) return null;

  if (pipelinesLoading || createPipelineMutation.isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!pipeline) return null;

  const stages = pipeline.pipelineStages;
  const dealCards = (deals ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    value: d.value,
    currency: d.currency,
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate,
    stageId: d.stageId,
    stageOrder: d.stageOrder,
    contact: d.contact,
    organization: d.organization,
    assignedTo: d.assignedTo,
  }));

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="sm">
          {pipelines && pipelines.length > 1 ? (
            <Select
              aria-label="Select pipeline"
              data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              value={pipeline.id}
              onChange={(value) => value && setSelectedPipelineId(value)}
              allowDeselect={false}
              w={220}
              size="md"
            />
          ) : (
            <Text fw={600} size="xl">
              {pipeline.name}
            </Text>
          )}
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            onClick={() => setNewPipelineOpen(true)}
          >
            New pipeline
          </Button>
        </Group>
        <Group gap="sm">
          <Button
            variant="light"
            leftSection={<IconSettings size={16} />}
            onClick={() => setSettingsModalOpen(true)}
          >
            Settings
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Add Deal
          </Button>
        </Group>
      </Group>

      {/* Stats */}
      {stats && <PipelineStats stats={stats} />}

      {/* Kanban board */}
      {dealsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      ) : (
        <DealKanbanBoard
          projectId={pipeline.id}
          stages={stages}
          deals={dealCards}
          onDealClick={(dealId) => setSelectedDealId(dealId)}
        />
      )}

      {/* Modals */}
      <CreateDealModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        projectId={pipeline.id}
        workspaceId={workspaceId!}
        stages={stages}
      />

      <PipelineSettingsModal
        opened={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        projectId={pipeline.id}
        stages={stages}
      />

      <DealDetailDrawer
        dealId={selectedDealId}
        projectId={pipeline.id}
        opened={!!selectedDealId}
        onClose={() => setSelectedDealId(null)}
      />

      <Modal
        opened={newPipelineOpen}
        onClose={() => setNewPipelineOpen(false)}
        title="New pipeline"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="e.g. Hiring"
            data-autofocus
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreatePipeline();
            }}
          />
          <Text c="dimmed" size="xs">
            Seeds the default stages — rename and reorder them in Settings.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setNewPipelineOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePipeline}
              loading={createPipelineMutation.isPending}
              disabled={!newPipelineName.trim()}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
