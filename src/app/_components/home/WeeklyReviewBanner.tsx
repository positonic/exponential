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

export function WeeklyReviewBanner() {
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

  const handleDismiss = () => {
    const currentWeek = getCurrentWeekKey();
    localStorage.setItem(BANNER_DISMISS_KEY, currentWeek);
    setDismissed(true);
  };

  // Don't show if: loading, already completed, dismissed, or no workspace
  if (isLoading || data?.isCompleted || dismissed || !workspace) {
    return null;
  }

  const reviewPath = `/w/${workspace.slug}/weekly-review`;

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
              Step back, regain clarity, and set your next actions. 🔒 Trust your system.
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
