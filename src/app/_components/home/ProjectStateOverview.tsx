"use client";

import {
  Card,
  Text,
  Stack,
  Group,
  Tooltip,
  Progress,
} from "@mantine/core";
import {
  IconFolder,
  IconTarget,
  IconActivity,
  IconPlayerPlay,
  IconCalendarCheck,
  IconTrendingUp,
  IconInfoCircle,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";

interface ProjectWithDetails {
  id: string;
  name: string;
  slug: string;
  progress: number;
  actions: Array<{
    id: string;
    status: string;
    completedAt: Date | null;
    dueDate: Date | null;
  }>;
  outcomes: Array<{
    id: string;
    type: string | null;
  }>;
}

interface HealthIndicators {
  weeklyPlanning: boolean;
  recentActivity: boolean;
  momentum: boolean;
  onTrack: boolean;
  hasProgress: boolean;
}

function calculateProjectHealth(project: ProjectWithDetails): {
  score: number;
  indicators: HealthIndicators;
} {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weeklyPlanning = project.outcomes.length > 0;
  const recentActivity = project.actions.some(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );
  const momentum = project.actions.some((a) => a.status === "ACTIVE");
  const onTrack = !project.actions.some(
    (a) =>
      a.dueDate &&
      new Date(a.dueDate) < today &&
      a.status !== "COMPLETED" &&
      a.status !== "DONE"
  );
  const hasProgress = project.progress > 0;

  const indicators = { weeklyPlanning, recentActivity, momentum, onTrack, hasProgress };
  const score = Object.values(indicators).filter(Boolean).length * 20;

  return { score, indicators };
}

function HealthRing({ score, size = 32 }: { score: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const colorClass =
    score >= 60
      ? "text-green-500"
      : score >= 40
        ? "text-yellow-500"
        : "text-red-500";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-surface-hover"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={`stroke-current ${colorClass}`}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text size="xs" fw={600} className={colorClass}>
          {score / 10}
        </Text>
      </div>
    </div>
  );
}

export function ProjectStateOverview() {
  const { workspace, workspaceId } = useWorkspace();
  const { data: projects, isLoading } =
    api.project.getActiveWithDetails.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  if (isLoading) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/2 rounded bg-surface-hover" />
          <div className="h-16 rounded bg-surface-hover" />
        </div>
      </Card>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <Stack gap="md">
          <Group gap="xs">
            <IconFolder size={18} className="text-text-primary" />
            <Text fw={600} size="sm" className="text-text-primary">
              Active Projects
            </Text>
          </Group>
          <Text size="sm" className="text-text-muted">
            No active projects. Create a project to get started.
          </Text>
        </Stack>
      </Card>
    );
  }

  // Sort projects by health score ascending (unhealthy first)
  const sortedProjects = [...projects].sort((a, b) => {
    const healthA = calculateProjectHealth(a).score;
    const healthB = calculateProjectHealth(b).score;
    return healthA - healthB;
  });

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <IconFolder size={18} className="text-text-primary" />
            <Text fw={600} size="sm" className="text-text-primary">
              Active Projects ({projects.length})
            </Text>
            <Tooltip
              label={
                <div className="space-y-1 text-xs">
                  <div className="font-semibold">Health Score (0-10)</div>
                  <div>Each indicator adds 2 points:</div>
                  <div>• Weekly Planning - Has weekly outcomes</div>
                  <div>• Recent Activity - Actions done in 7 days</div>
                  <div>• Momentum - Has active actions</div>
                  <div>• On Track - No overdue actions</div>
                  <div>• Progress - Has tracked progress</div>
                </div>
              }
              withArrow
              multiline
              w={240}
            >
              <IconInfoCircle
                size={14}
                className="cursor-help text-text-muted"
              />
            </Tooltip>
          </Group>
        </Group>

        <Stack gap="sm">
          {sortedProjects.map((project) => {
            const { score, indicators } = calculateProjectHealth(project);
            const activeActions = project.actions.filter(
              (a) => a.status === "ACTIVE"
            ).length;

            const projectUrl = workspace
              ? `/w/${workspace.slug}/projects/${project.slug}-${project.id}`
              : `/projects/${project.slug}-${project.id}`;

            return (
              <Link
                key={project.id}
                href={projectUrl}
                className="block rounded-md bg-background-primary p-3 transition-colors hover:bg-surface-hover"
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  {/* Health Ring */}
                  <HealthRing score={score} />

                  {/* Project Info */}
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      size="sm"
                      fw={500}
                      className="truncate text-text-primary"
                    >
                      {project.name}
                    </Text>
                    <Group gap="xs">
                      <Text size="xs" className="text-text-muted">
                        {activeActions} action{activeActions !== 1 ? "s" : ""}
                      </Text>
                      {project.progress > 0 && (
                        <Progress
                          value={project.progress}
                          size="xs"
                          radius="xl"
                          style={{ width: 60 }}
                        />
                      )}
                    </Group>
                  </Stack>

                  {/* Health Indicators */}
                  <Group gap={4}>
                    <Tooltip
                      label={
                        indicators.weeklyPlanning
                          ? "Outcomes linked"
                          : "No outcomes linked"
                      }
                      withArrow
                    >
                      <IconTarget
                        size={14}
                        className={
                          indicators.weeklyPlanning
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      />
                    </Tooltip>
                    <Tooltip
                      label={
                        indicators.recentActivity
                          ? "Recent activity"
                          : "No recent activity"
                      }
                      withArrow
                    >
                      <IconActivity
                        size={14}
                        className={
                          indicators.recentActivity
                            ? "text-green-500"
                            : "text-yellow-500"
                        }
                      />
                    </Tooltip>
                    <Tooltip
                      label={
                        indicators.momentum
                          ? "Active actions in progress"
                          : "No active actions"
                      }
                      withArrow
                    >
                      <IconPlayerPlay
                        size={14}
                        className={
                          indicators.momentum
                            ? "text-green-500"
                            : "text-yellow-500"
                        }
                      />
                    </Tooltip>
                    <Tooltip
                      label={
                        indicators.onTrack
                          ? "On track"
                          : "Has overdue actions"
                      }
                      withArrow
                    >
                      <IconCalendarCheck
                        size={14}
                        className={
                          indicators.onTrack
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      />
                    </Tooltip>
                    <Tooltip
                      label={
                        indicators.hasProgress
                          ? "Progress tracked"
                          : "No progress set"
                      }
                      withArrow
                    >
                      <IconTrendingUp
                        size={14}
                        className={
                          indicators.hasProgress
                            ? "text-green-500"
                            : "text-text-muted"
                        }
                      />
                    </Tooltip>
                  </Group>
                </Group>
              </Link>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
