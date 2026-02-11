"use client";

import {
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Skeleton,
  Accordion,
} from "@mantine/core";
import {
  IconCheck,
  IconX,
  IconLoader,
  IconClock,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface PipelineRunHistoryProps {
  workspaceId?: string;
}

const STATUS_CONFIG: Record<
  string,
  { color: string; icon: typeof IconCheck }
> = {
  SUCCESS: { color: "green", icon: IconCheck },
  FAILED: { color: "red", icon: IconX },
  RUNNING: { color: "blue", icon: IconLoader },
  CANCELLED: { color: "gray", icon: IconX },
};

export function PipelineRunHistory({ workspaceId }: PipelineRunHistoryProps) {
  const { data, isLoading } = api.workflowPipeline.listRuns.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton height={80} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  if (!data?.runs.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border-primary bg-surface-secondary py-16">
        <IconClock size={48} className="mb-4 text-text-muted" stroke={1.5} />
        <Text className="mb-2 text-text-secondary" size="lg" fw={500}>
          No pipeline runs yet
        </Text>
        <Text className="text-text-muted" size="sm">
          Generate content to see run history here
        </Text>
      </div>
    );
  }

  return (
    <Accordion variant="separated">
      {data.runs.map((run) => {
        const config = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.CANCELLED!;
        const StatusIcon = config.icon;
        const duration =
          run.completedAt && run.startedAt
            ? Math.round(
                (new Date(run.completedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1000,
              )
            : null;

        return (
          <Accordion.Item key={run.id} value={run.id}>
            <Accordion.Control>
              <Group justify="space-between">
                <Group gap="sm">
                  <StatusIcon size={16} />
                  <Text size="sm" fw={500} className="text-text-primary">
                    {run.definition.name}
                  </Text>
                  <Badge color={config.color} variant="light" size="xs">
                    {run.status}
                  </Badge>
                </Group>
                <Group gap="sm">
                  {run._count.contentDrafts > 0 && (
                    <Text size="xs" className="text-text-muted">
                      {run._count.contentDrafts} draft
                      {run._count.contentDrafts !== 1 ? "s" : ""}
                    </Text>
                  )}
                  {duration !== null && (
                    <Text size="xs" className="text-text-muted">
                      {duration}s
                    </Text>
                  )}
                  <Text size="xs" className="text-text-muted">
                    {new Date(run.startedAt).toLocaleString()}
                  </Text>
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="xs" className="text-text-muted">
                  Steps: {run._count.stepRuns} | Drafts:{" "}
                  {run._count.contentDrafts}
                </Text>
                {run.errorMessage && (
                  <Card
                    className="border border-red-500/20 bg-red-500/5"
                    padding="xs"
                  >
                    <Text size="xs" c="red">
                      {run.errorMessage}
                    </Text>
                  </Card>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}
