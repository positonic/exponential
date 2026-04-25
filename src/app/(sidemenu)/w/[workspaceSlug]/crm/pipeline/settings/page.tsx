"use client";

import { useEffect } from "react";
import { Text, Loader, Stack, Paper } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { PipelineSettingsModal } from "~/app/_components/pipeline/PipelineSettingsModal";

export default function PipelineSettingsPage() {
  const { workspace, workspaceId } = useWorkspace();

  const utils = api.useUtils();

  const {
    data: pipeline,
    isLoading: pipelineLoading,
    error: pipelineError,
  } = api.pipeline.get.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );

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

  if (!workspace) return null;

  if (pipelineLoading || createPipelineMutation.isPending) {
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
            window.history.back();
          }}
          projectId={pipeline.id}
          stages={pipeline.pipelineStages}
        />
      </Paper>
    </Stack>
  );
}
