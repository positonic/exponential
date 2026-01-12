"use client";

import {
  Card,
  Text,
  Stack,
  Group,
  Badge,
  Tooltip,
  Progress,
} from "@mantine/core";
import { IconFolder, IconTarget, IconCheck } from "@tabler/icons-react";
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
  }>;
  outcomes: Array<{
    id: string;
    type: string | null;
  }>;
}

function isProjectQuiet(project: ProjectWithDetails): boolean {
  // Project is "quiet" if no actions have been completed in the last 7 days
  // and there are no active actions
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentCompletedActions = project.actions.filter(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );
  const activeActions = project.actions.filter((a) => a.status === "ACTIVE");

  return recentCompletedActions.length === 0 && activeActions.length === 0 && project.actions.length > 0;
}

function hasOutcomeGap(project: ProjectWithDetails): boolean {
  // Check if project has any weekly outcomes
  const weeklyOutcomes = project.outcomes.filter((o) => o.type === "weekly");
  return weeklyOutcomes.length === 0;
}

export function ProjectStateOverview() {
  const { workspace } = useWorkspace();
  const { data: projects, isLoading } =
    api.project.getActiveWithDetails.useQuery();

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
          </Group>
        </Group>

        <Stack gap="sm">
          {projects.slice(0, 4).map((project) => {
            const quiet = isProjectQuiet(project);
            const outcomeGap = hasOutcomeGap(project);
            const activeActions = project.actions.filter(
              (a) => a.status === "ACTIVE"
            ).length;

            const projectUrl = workspace
              ? `/w/${workspace.slug}/projects/${project.slug}`
              : `/projects/${project.slug}`;

            return (
              <Link
                key={project.id}
                href={projectUrl}
                className="block rounded-md bg-background-primary p-3 transition-colors hover:bg-surface-hover"
              >
                <Group justify="space-between" wrap="nowrap">
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

                  <Group gap={4}>
                    {quiet && (
                      <Tooltip label="No recent activity" withArrow>
                        <Badge size="xs" color="yellow" variant="light">
                          quiet
                        </Badge>
                      </Tooltip>
                    )}
                    {outcomeGap && (
                      <Tooltip label="No weekly outcomes set" withArrow>
                        <IconTarget size={14} className="text-text-muted" />
                      </Tooltip>
                    )}
                    {!quiet && !outcomeGap && (
                      <IconCheck size={14} className="text-green-500" />
                    )}
                  </Group>
                </Group>
              </Link>
            );
          })}
        </Stack>

        {projects.length > 4 && (
          <Link
            href={workspace ? `/w/${workspace.slug}/projects` : "/projects"}
            className="text-center text-xs text-text-muted hover:text-text-secondary"
          >
            View all {projects.length} projects
          </Link>
        )}
      </Stack>
    </Card>
  );
}
