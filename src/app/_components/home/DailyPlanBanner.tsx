"use client";

import { useState } from "react";
import { Paper, Group, Text, CloseButton } from "@mantine/core";
import { IconSun } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { startOfDay } from "date-fns";

const BANNER_DISMISS_KEY = "daily-plan-banner-dismissed";

function getDismissedDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BANNER_DISMISS_KEY);
}

function getTodayKey(): string {
  return startOfDay(new Date()).toISOString().split("T")[0] ?? "";
}

export function DailyPlanBanner({ compact }: { compact?: boolean } = {}) {
  const { workspace } = useWorkspace();
  const [dismissed, setDismissed] = useState(() => {
    const dismissedDate = getDismissedDate();
    const today = getTodayKey();
    return dismissedDate === today;
  });

  // Check if today's daily plan exists and its status
  // Pass client's local date to ensure timezone consistency with the daily plan page
  const { data: dailyPlan, isLoading } = api.dailyPlan.getOrCreateToday.useQuery({
    date: startOfDay(new Date())
  });

  // Check workspace setting
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspace?.slug ?? "" },
    { enabled: !!workspace?.slug }
  );

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const today = getTodayKey();
    localStorage.setItem(BANNER_DISMISS_KEY, today);
    setDismissed(true);
  };

  // Don't show if: loading, already completed today, dismissed today, or disabled in workspace settings
  if (isLoading || dailyPlan?.status === "COMPLETED" || dismissed || workspaceData?.enableDailyPlanBanner === false) {
    return null;
  }

  const hasStarted = dailyPlan && dailyPlan.plannedActions.length > 0;
  const dailyPlanPath = "/daily-plan";

  if (compact) {
    return (
      <Paper
        component={Link}
        href={dailyPlanPath}
        p="md"
        radius="md"
        className="flex h-full flex-1 cursor-pointer flex-col justify-between border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/10 transition-opacity hover:opacity-90"
        style={{ textDecoration: "none" }}
      >
        <Group gap="sm" wrap="nowrap" mb="xs">
          <IconSun size={20} className="text-amber-400 flex-shrink-0" />
          <Text fw={600} size="sm" className="text-text-primary">
            {hasStarted ? "Continue Planning" : "Plan Your Day"}
          </Text>
          <CloseButton
            size="xs"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="ml-auto"
          />
        </Group>
        <Text size="xs" className="text-text-secondary">
          {hasStarted ? "Finish setting up your day." : "Set your tasks for a productive day."}
        </Text>
      </Paper>
    );
  }

  return (
    <Paper
      component={Link}
      href={dailyPlanPath}
      p="md"
      radius="md"
      mb="lg"
      className="cursor-pointer border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/10 transition-opacity hover:opacity-90"
      style={{ textDecoration: "none" }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <IconSun size={24} className="text-amber-400" />
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              {hasStarted ? "Continue planning your day" : "Plan your day"}
            </Text>
            <Text size="xs" className="text-text-secondary">
              {hasStarted
                ? "You started planning - finish setting up your day for success."
                : "Take a few minutes to plan your tasks and set yourself up for a productive day."}
            </Text>
          </div>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <CloseButton
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss daily plan reminder"
          />
        </Group>
      </Group>
    </Paper>
  );
}
