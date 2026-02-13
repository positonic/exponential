"use client";

import { useState, useEffect } from "react";
import { Group, Button, Text, Loader, Stack } from "@mantine/core";
import { IconPlus, IconSettings } from "@tabler/icons-react";
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

  const utils = api.useUtils();

  // Query for existing pipeline
  const {
    data: pipeline,
    isLoading: pipelineLoading,
    error: pipelineError,
  } = api.pipeline.get.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );

  // Mutation to create pipeline if it doesn't exist
  const createPipelineMutation = api.pipeline.create.useMutation({
    onSuccess: () => {
      void utils.pipeline.get.invalidate({ workspaceId: workspaceId! });
    },
  });

  // Auto-create pipeline if none exists
  useEffect(() => {
    if (
      workspaceId &&
      !pipelineLoading &&
      !pipeline &&
      !pipelineError &&
      !createPipelineMutation.isPending &&
      !createPipelineMutation.isSuccess
    ) {
      createPipelineMutation.mutate({ workspaceId });
    }
  }, [workspaceId, pipelineLoading, pipeline, pipelineError, createPipelineMutation]);

  const { data: deals, isLoading: dealsLoading } =
    api.pipeline.getDeals.useQuery(
      { projectId: pipeline?.id ?? "" },
      { enabled: !!pipeline?.id },
    );

  const { data: stats } = api.pipeline.getStats.useQuery(
    { projectId: pipeline?.id ?? "" },
    { enabled: !!pipeline?.id },
  );

  if (!workspace) return null;

  if (pipelineLoading || createPipelineMutation.isPending) {
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
        <Text fw={600} size="xl">
          Pipeline
        </Text>
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
    </Stack>
  );
}
