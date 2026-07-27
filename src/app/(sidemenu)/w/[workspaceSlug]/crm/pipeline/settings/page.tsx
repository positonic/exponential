"use client";

import { useEffect, useState } from "react";
import { Text, Loader, Stack, Paper, Group, Select } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { PipelineSettingsModal } from "~/app/_components/pipeline/PipelineSettingsModal";

export default function PipelineSettingsPage() {
  const { workspace, workspaceId } = useWorkspace();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null,
  );

  const { data: pipelines, isLoading: pipelinesLoading } =
    api.pipeline.list.useQuery(
      { workspaceId: workspaceId! },
      { enabled: !!workspaceId },
    );

  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return;
    if (
      !selectedPipelineId ||
      !pipelines.some((p) => p.id === selectedPipelineId)
    ) {
      setSelectedPipelineId(pipelines[0]!.id);
    }
  }, [pipelines, selectedPipelineId]);

  const pipeline =
    pipelines?.find((p) => p.id === selectedPipelineId) ?? pipelines?.[0];

  if (!workspace) return null;

  if (pipelinesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!pipeline) return null;

  // Render inline settings (not as a modal)
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} size="xl">
          Pipeline Settings
        </Text>
        {pipelines && pipelines.length > 1 && (
          <Select
            aria-label="Select pipeline"
            data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
            value={pipeline.id}
            onChange={(value) => value && setSelectedPipelineId(value)}
            allowDeselect={false}
            w={220}
          />
        )}
      </Group>
      <Paper p="lg" radius="md" withBorder>
        <PipelineSettingsModal
          key={pipeline.id}
          opened={true}
          onClose={() => {
            window.history.back();
          }}
          projectId={pipeline.id}
          stages={pipeline.pipelineStages}
        />
      </Paper>
    </Stack>
  );
}
