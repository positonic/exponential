'use client';

import { useEffect, useRef } from "react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import { Button, Stack, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyPlanChecker() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const ranRef = useRef(false);

  const { data: status } = api.dailyPlan.getTodayStatus.useQuery(
    { workspaceId: workspaceId ?? undefined },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );

  const ensureAction = api.action.ensureDailyPlanPromptAction.useMutation({
    onSuccess: (result) => {
      if (result.created) {
        void utils.action.getToday.invalidate();
        void utils.action.getAll.invalidate();
      }
    },
    onError: (err) => {
      console.error("[DailyPlanChecker] ensureDailyPlanPromptAction failed:", err);
    },
  });

  useEffect(() => {
    if (ranRef.current) return;
    if (!status || status.completed) return;

    ranRef.current = true;

    ensureAction.mutate({ workspaceId: workspaceId ?? undefined });

    const key = `dailyPlanToastShown_${todayKey()}`;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(key)) return;

    window.localStorage.setItem(key, "1");

    const notificationId = "daily-plan-nudge";
    notifications.show({
      id: notificationId,
      title: "Plan your day?",
      color: "blue",
      autoClose: 8000,
      withCloseButton: true,
      withBorder: true,
      message: (
        <Stack gap={6} mt={4}>
          <Text size="sm">
            You haven&apos;t done your daily plan yet. Five minutes now saves an hour later.
          </Text>
          <Button
            component={Link}
            href="/daily-plan"
            size="xs"
            variant="light"
            color="blue"
            onClick={() => notifications.hide(notificationId)}
            style={{ alignSelf: "flex-start" }}
          >
            Start
          </Button>
        </Stack>
      ),
    });
  }, [status, workspaceId, ensureAction, utils]);

  return null;
}
