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
  IconInfoCircle,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { calculateProjectHealth, HealthRing, HealthIndicatorIcons } from "./ProjectHealth";
import { EmptyState } from "../EmptyState";

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
          <EmptyState
            icon={IconFolder}
            message="Projects help you organize your work. Create a project to start tracking progress and health."
            compact
            action={
              workspace ? (
                <Link href={`/w/${workspace.slug}/projects`}>
                  <Text size="sm" className="text-brand-primary cursor-pointer hover:underline">
                    <IconPlus size={12} className="mr-1 inline" />
                    Create a project
                  </Text>
                </Link>
              ) : undefined
            }
          />
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
                  <HealthIndicatorIcons indicators={indicators} />
                </Group>
              </Link>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
