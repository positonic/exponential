"use client";

import {
  Card,
  Text,
  Stack,
  Group,
  Badge,
  Progress,
  Skeleton,
} from "@mantine/core";
import {
  IconTarget,
  IconChevronRight,
  IconTrendingUp,
  IconAlertTriangle,
  IconCircleCheck,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { CreateGoalModal } from "../CreateGoalModal";

const domainColors: Record<string, string> = {
  Health: "green",
  Career: "blue",
  Relationships: "pink",
  Finance: "yellow",
  Growth: "violet",
  Spirituality: "cyan",
  Fun: "orange",
  Environment: "teal",
};

function getProgressColor(progress: number): string {
  if (progress >= 70) return "green";
  if (progress >= 40) return "yellow";
  return "red";
}

function getStatusColor(status: string): string {
  switch (status) {
    case "on-track":
    case "achieved":
      return "text-green-500";
    case "at-risk":
      return "text-yellow-500";
    case "off-track":
      return "text-red-500";
    default:
      return "text-text-muted";
  }
}

export function GoalsProgressDashboard() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: objectives, isLoading: objectivesLoading } =
    api.okr.getByObjective.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  const { data: stats, isLoading: statsLoading } = api.okr.getStats.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  const goalsPath = workspaceSlug ? `/w/${workspaceSlug}/goals` : "/goals";
  const okrsPath = workspaceSlug ? `/w/${workspaceSlug}/okrs` : "/okrs";

  const isLoading = objectivesLoading || statsLoading;

  if (isLoading) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary mb-6"
      >
        <Stack gap="md">
          <Skeleton height={24} width={200} />
          <Group grow gap="xs">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={60} />
            ))}
          </Group>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </Stack>
      </Card>
    );
  }

  // Don't show if no goals exist
  if (!objectives || objectives.length === 0) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary mb-6"
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconTarget size={20} className="text-brand-primary" />
              <Text fw={600} className="text-text-primary">
                Objectives
              </Text>
            </Group>
            <CreateGoalModal>
              <Text
                component="span"
                className="text-brand-primary hover:underline text-sm flex items-center gap-1 cursor-pointer"
              >
                Create Objective <IconChevronRight size={14} />
              </Text>
            </CreateGoalModal>
          </Group>
          <Text size="sm" className="text-text-muted">
            No objectives yet. Create objectives to track your key results.
          </Text>
        </Stack>
      </Card>
    );
  }

  const hasKeyResults = stats && stats.totalKeyResults > 0;

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary mb-6"
    >
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <IconTarget size={20} className="text-brand-primary" />
            <Text fw={600} className="text-text-primary">
              Objectives & Key Results
            </Text>
          </Group>
          <Link
            href={goalsPath}
            className="text-brand-primary hover:underline text-sm flex items-center gap-1"
          >
            View All <IconChevronRight size={14} />
          </Link>
        </Group>

        {/* Stats Row */}
        {stats && (
          <Group grow gap="xs">
            <div className="text-center p-3 rounded-md bg-background-primary">
              <Text size="xs" className="text-text-muted">
                Objectives
              </Text>
              <Text size="xl" fw={600} className="text-text-primary">
                {stats.totalObjectives}
              </Text>
            </div>
            <div className="text-center p-3 rounded-md bg-background-primary">
              <Text size="xs" className="text-text-muted">
                Key Results
              </Text>
              <Text size="xl" fw={600} className="text-text-primary">
                {stats.totalKeyResults}
              </Text>
            </div>
            <div className="text-center p-3 rounded-md bg-background-primary">
              <Text size="xs" className="text-text-muted">
                Progress
              </Text>
              <Text
                size="xl"
                fw={600}
                className={`text-${getProgressColor(stats.averageProgress)}-500`}
              >
                {stats.averageProgress}%
              </Text>
            </div>
            {hasKeyResults && (
              <div className="text-center p-3 rounded-md bg-background-primary">
                <Group gap={4} justify="center" mb={4}>
                  <IconTrendingUp size={14} className="text-green-500" />
                  <Text size="xs" className="text-text-muted">
                    On Track
                  </Text>
                </Group>
                <Text size="xl" fw={600} className="text-text-primary">
                  {stats.statusBreakdown.onTrack + stats.statusBreakdown.achieved}
                </Text>
              </div>
            )}
          </Group>
        )}

        {/* Overall Progress Bar */}
        {hasKeyResults && stats && (
          <div>
            <Group justify="space-between" mb="xs">
              <Text size="xs" className="text-text-muted">
                Overall Progress
              </Text>
              <Text size="xs" fw={500} className="text-text-primary">
                {stats.averageProgress}%
              </Text>
            </Group>
            <Progress
              value={stats.averageProgress}
              color={getProgressColor(stats.averageProgress)}
              size="sm"
              radius="xl"
            />
          </div>
        )}

        {/* Goals List */}
        <Stack gap="sm">
          {objectives.slice(0, 5).map((goal) => {
            const hasKRs = goal.keyResults.length > 0;

            return (
              <Link
                key={goal.id}
                href={`${okrsPath}?objective=${goal.id}`}
                className="block rounded-md bg-background-primary p-3 transition-colors hover:bg-surface-hover"
              >
                <Group justify="space-between" wrap="nowrap" mb={hasKRs ? "xs" : 0}>
                  <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      size="sm"
                      fw={500}
                      className="truncate text-text-primary"
                    >
                      {goal.title}
                    </Text>
                    {goal.lifeDomain && (
                      <Badge
                        size="xs"
                        color={domainColors[goal.lifeDomain.title] ?? "gray"}
                        variant="dot"
                      >
                        {goal.lifeDomain.title}
                      </Badge>
                    )}
                  </Group>
                  {hasKRs && (
                    <Group gap="xs">
                      <Text
                        size="sm"
                        fw={600}
                        className={`text-${getProgressColor(goal.progress)}-500`}
                      >
                        {goal.progress}%
                      </Text>
                    </Group>
                  )}
                </Group>

                {/* Key Results */}
                {hasKRs && (
                  <Stack gap={4} mt="xs">
                    {goal.keyResults.slice(0, 3).map((kr) => {
                      const range = kr.targetValue - kr.startValue;
                      const progress =
                        range > 0
                          ? Math.min(
                              100,
                              Math.max(
                                0,
                                ((kr.currentValue - kr.startValue) / range) * 100
                              )
                            )
                          : 0;

                      return (
                        <Group key={kr.id} gap="xs" wrap="nowrap">
                          {kr.status === "achieved" ? (
                            <IconCircleCheck
                              size={12}
                              className="text-green-500 flex-shrink-0"
                            />
                          ) : kr.status === "at-risk" ? (
                            <IconAlertTriangle
                              size={12}
                              className="text-yellow-500 flex-shrink-0"
                            />
                          ) : (
                            <IconTrendingUp
                              size={12}
                              className={`${getStatusColor(kr.status)} flex-shrink-0`}
                            />
                          )}
                          <Text
                            size="xs"
                            className="text-text-muted truncate"
                            style={{ flex: 1, minWidth: 0 }}
                          >
                            {kr.title}
                          </Text>
                          <Progress
                            value={progress}
                            color={getProgressColor(progress)}
                            size="xs"
                            radius="xl"
                            style={{ width: 60 }}
                            className="flex-shrink-0"
                          />
                          <Text
                            size="xs"
                            className="text-text-muted flex-shrink-0"
                            style={{ width: 35, textAlign: "right" }}
                          >
                            {Math.round(progress)}%
                          </Text>
                        </Group>
                      );
                    })}
                    {goal.keyResults.length > 3 && (
                      <Text size="xs" className="text-text-muted pl-5">
                        +{goal.keyResults.length - 3} more key results
                      </Text>
                    )}
                  </Stack>
                )}

                {/* No KRs yet */}
                {!hasKRs && (
                  <Text size="xs" className="text-text-muted italic">
                    No key results defined
                  </Text>
                )}
              </Link>
            );
          })}

          {/* Show more link */}
          {objectives.length > 5 && (
            <Link
              href={goalsPath}
              className="text-center text-sm text-brand-primary hover:underline py-2"
            >
              View all {objectives.length} objectives
            </Link>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
