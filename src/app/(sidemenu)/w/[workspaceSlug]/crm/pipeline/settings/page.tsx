"use client";

import { Text, Loader, Stack, Paper } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { PipelineSettingsModal } from "~/app/_components/pipeline/PipelineSettingsModal";

export default function PipelineSettingsPage() {
  const { workspace, workspaceId } = useWorkspace();

  const { data: pipeline, isLoading } = api.pipeline.getOrCreate.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );

  if (!workspace) return null;

  if (isLoading) {
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
      <Text fw={600} size="xl">
        Pipeline Settings
      </Text>
      <Paper p="lg" radius="md" withBorder>
        <PipelineSettingsModal
          opened={true}
          onClose={() => {
            // Navigate back to pipeline
            window.history.back();
          }}
          projectId={pipeline.id}
          stages={pipeline.pipelineStages}
        />
      </Paper>
    </Stack>
  );
}
