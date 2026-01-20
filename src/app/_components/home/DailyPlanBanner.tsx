"use client";

import { useState } from "react";
import { Paper, Group, Text, Button, CloseButton } from "@mantine/core";
import { IconSun } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { startOfDay } from "date-fns";

const BANNER_DISMISS_KEY = "daily-plan-banner-dismissed";

function getDismissedDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BANNER_DISMISS_KEY);
}

function getTodayKey(): string {
  return startOfDay(new Date()).toISOString().split("T")[0] ?? "";
}

export function DailyPlanBanner() {
  const [dismissed, setDismissed] = useState(() => {
    const dismissedDate = getDismissedDate();
    const today = getTodayKey();
    return dismissedDate === today;
  });

  // Check if today's daily plan exists and its status
  const { data: dailyPlan, isLoading } = api.dailyPlan.getOrCreateToday.useQuery({});

  const handleDismiss = () => {
    const today = getTodayKey();
    localStorage.setItem(BANNER_DISMISS_KEY, today);
    setDismissed(true);
  };

  // Don't show if: loading, already completed today, or dismissed today
  if (isLoading || dailyPlan?.status === "COMPLETED" || dismissed) {
    return null;
  }

  const hasStarted = dailyPlan && dailyPlan.plannedActions.length > 0;

  return (
    <Paper
      p="md"
      radius="md"
      mb="lg"
      className="border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/10"
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
          <Button component={Link} href="/daily-plan" size="xs" variant="filled" color="orange">
            {hasStarted ? "Continue" : "Start Planning"}
          </Button>
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
