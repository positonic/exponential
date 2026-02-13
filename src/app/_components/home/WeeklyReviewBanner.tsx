"use client";

import { useState } from "react";
import { Paper, Group, Text, Button, CloseButton } from "@mantine/core";
import { IconCalendarCheck } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { getSundayWeekStart } from "~/lib/weekUtils";

const BANNER_DISMISS_KEY = "weekly-review-banner-dismissed";

function getDismissedWeek(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BANNER_DISMISS_KEY);
}

function getCurrentWeekKey(): string {
  return getSundayWeekStart(new Date()).toISOString().split("T")[0] ?? "";
}

export function WeeklyReviewBanner({ compact }: { compact?: boolean } = {}) {
  const { workspace, workspaceId } = useWorkspace();
  const [dismissed, setDismissed] = useState(() => {
    const dismissedWeek = getDismissedWeek();
    const currentWeek = getCurrentWeekKey();
    return dismissedWeek === currentWeek;
  });

  const { data, isLoading } = api.weeklyReview.isCompletedThisWeek.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId }
  );

  // Check if user has any projects
  const { data: projectsData, isLoading: projectsLoading } =
    api.project.getAll.useQuery(
      { workspaceId: workspaceId ?? undefined },
      { enabled: !!workspaceId }
    );

  const hasProjects = (projectsData?.length ?? 0) > 0;

  const handleDismiss = () => {
    const currentWeek = getCurrentWeekKey();
    localStorage.setItem(BANNER_DISMISS_KEY, currentWeek);
    setDismissed(true);
  };

  // Don't show if: loading, already completed, dismissed, no workspace, or no projects
  if (isLoading || projectsLoading || data?.isCompleted || dismissed || !workspace || !hasProjects) {
    return null;
  }

  const reviewPath = `/w/${workspace.slug}/weekly-review`;

  if (compact) {
    return (
      <Paper
        p="md"
        radius="md"
        className="flex h-full flex-1 flex-col justify-between border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-cyan-500/10"
      >
        <Group gap="sm" wrap="nowrap" mb="xs">
          <IconCalendarCheck size={20} className="text-blue-400 flex-shrink-0" />
          <Text fw={600} size="sm" className="text-text-primary">
            Weekly Review
          </Text>
          <CloseButton
            size="xs"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="ml-auto"
          />
        </Group>
        <Text size="xs" className="text-text-secondary mb-2">
          Review your projects and plan next week.
        </Text>
        <Button component={Link} href={reviewPath} size="xs" variant="filled" fullWidth>
          Start Review
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      p="md"
      radius="md"
      mb="lg"
      className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-cyan-500/10"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <IconCalendarCheck size={24} className="text-blue-400" />
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              🧘 Time for your weekly review
            </Text>
            <Text size="xs" className="text-text-secondary">
              The weekly review is the keystone habit of GTD and other trusted productivity systems. Review your projects to ensure they are prioritised correctly and you know what to focus on next week.
            </Text>
          </div>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Button component={Link} href={reviewPath} size="xs" variant="filled">
            Start Review
          </Button>
          <CloseButton
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss weekly review reminder"
          />
        </Group>
      </Group>
    </Paper>
  );
}
