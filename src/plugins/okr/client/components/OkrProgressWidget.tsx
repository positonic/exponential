"use client";

import {
  Card,
  Title,
  Text,
  Progress,
  Group,
  Stack,
  Badge,
  Skeleton,
} from "@mantine/core";
import {
  IconTargetArrow,
  IconTrendingUp,
  IconAlertTriangle,
  IconCircleCheck,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import Link from "next/link";

interface OkrProgressWidgetProps {
  period?: string;
}

export function OkrProgressWidget({ period }: OkrProgressWidgetProps) {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: stats, isLoading } = api.okr.getStats.useQuery(
    { workspaceId: workspaceId ?? undefined, period },
    { enabled: true }
  );

  if (isLoading) {
    return (
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="md">
          <Skeleton height={24} width={150} />
          <Skeleton height={8} />
          <Group>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={60} style={{ flex: 1 }} />
            ))}
          </Group>
        </Stack>
      </Card>
    );
  }

  if (!stats || stats.totalKeyResults === 0) {
    return null;
  }

  const { totalObjectives, totalKeyResults, statusBreakdown, averageProgress } =
    stats;
  const okrPath = workspaceSlug ? `/w/${workspaceSlug}/okrs` : "/okrs";

  return (
    <Card
      className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
      component={Link}
      href={okrPath}
    >
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <IconTargetArrow size={20} className="text-brand-primary" />
          <Title order={4} className="text-text-primary">
            OKR Progress
          </Title>
        </Group>
        <Badge color="blue" variant="light">
          {period ?? "All Time"}
        </Badge>
      </Group>

      <Stack gap="sm">
        {/* Overall Progress */}
        <div>
          <Group justify="space-between" mb="xs">
            <Text size="sm" className="text-text-muted">
              Overall Progress
            </Text>
            <Text size="sm" fw={600} className="text-text-primary">
              {averageProgress}%
            </Text>
          </Group>
          <Progress
            value={averageProgress}
            color={
              averageProgress >= 70
                ? "green"
                : averageProgress >= 40
                  ? "yellow"
                  : "red"
            }
            size="lg"
            radius="xl"
          />
        </div>

        {/* Status Breakdown */}
        <Group grow gap="xs">
          <div className="text-center p-2 rounded bg-background-primary">
            <IconTrendingUp
              size={16}
              className="text-green-500 mx-auto mb-1"
            />
            <Text size="xs" className="text-text-muted">
              On Track
            </Text>
            <Text size="lg" fw={600} className="text-text-primary">
              {statusBreakdown.onTrack}
            </Text>
          </div>
          <div className="text-center p-2 rounded bg-background-primary">
            <IconAlertTriangle
              size={16}
              className="text-yellow-500 mx-auto mb-1"
            />
            <Text size="xs" className="text-text-muted">
              At Risk
            </Text>
            <Text size="lg" fw={600} className="text-text-primary">
              {statusBreakdown.atRisk}
            </Text>
          </div>
          <div className="text-center p-2 rounded bg-background-primary">
            <IconCircleCheck size={16} className="text-blue-500 mx-auto mb-1" />
            <Text size="xs" className="text-text-muted">
              Achieved
            </Text>
            <Text size="lg" fw={600} className="text-text-primary">
              {statusBreakdown.achieved}
            </Text>
          </div>
        </Group>

        {/* Summary */}
        <Text size="xs" className="text-text-muted text-center">
          {totalObjectives} Objectives / {totalKeyResults} Key Results
        </Text>
      </Stack>
    </Card>
  );
}
