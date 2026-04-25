"use client";

import { Paper, Group, Text, Button, CloseButton } from "@mantine/core";
import { IconCalendarEvent } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

interface QuarterlyPromptBannerProps {
  currentQuarter: string;
}

export function QuarterlyPromptBanner({ currentQuarter }: QuarterlyPromptBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Paper
      p="md"
      radius="md"
      mb="lg"
      className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <IconCalendarEvent size={24} className="text-purple-400" />
          <div>
            <Text fw={600} size="sm">
              Time for your {currentQuarter} assessment!
            </Text>
            <Text size="xs" c="dimmed">
              Reflect on your progress and set new priorities for the quarter.
            </Text>
          </div>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Button
            component={Link}
            href="/wheel-of-life/assessment?type=quarterly"
            size="xs"
            variant="filled"
          >
            Start Assessment
          </Button>
          <CloseButton size="sm" onClick={() => setDismissed(true)} />
        </Group>
      </Group>
    </Paper>
  );
}
