"use client";

import { Text, Paper, Group, Button, ThemeIcon, ActionIcon } from "@mantine/core";
import { IconTarget, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";

/**
 * Compact "Continue setting up your workspace" banner shown in CommandCenter
 * while the welcome setup is incomplete. Links to /welcome; dismissing marks
 * welcome as complete.
 */
export function WelcomeBanner() {
  const utils = api.useUtils();
  const { data, isLoading } = api.user.getWelcomeProgress.useQuery();
  const completeWelcome = api.user.completeWelcome.useMutation({
    onSuccess: () => {
      void utils.user.getWelcomeProgress.invalidate();
    },
  });

  if (isLoading || data?.welcomeCompletedAt) {
    return null;
  }

  const steps = data?.steps;
  if (!steps) return null;

  const completedCount = Object.values(steps).filter(Boolean).length;
  const totalCount = Object.values(steps).length;

  return (
    <Paper
      component={Link}
      href="/welcome"
      p="md"
      radius="md"
      mb="lg"
      className="block cursor-pointer border border-accent-indigo/20 bg-gradient-to-r from-accent-indigo/10 to-accent-periwinkle/10 transition-colors hover:from-accent-indigo/15 hover:to-accent-periwinkle/15"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size="lg" radius="xl" variant="light" color="indigo">
            <IconTarget size={18} />
          </ThemeIcon>
          <div>
            <Text fw={500} size="sm" className="text-text-primary">
              Continue setting up your workspace
            </Text>
            <Text size="xs" className="text-text-secondary">
              {completedCount} of {totalCount} steps complete
            </Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="light" size="xs" component="span">
            Continue
          </Button>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              completeWelcome.mutate();
            }}
            aria-label="Dismiss setup banner"
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}
