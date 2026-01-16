"use client";

import { Card, Text, Stack, Button, Group } from "@mantine/core";
import { IconCalendarWeek, IconArrowRight } from "@tabler/icons-react";

interface WeeklyReviewIntroProps {
  projectCount: number;
  onStart: () => void;
}

export function WeeklyReviewIntro({
  projectCount,
  onStart,
}: WeeklyReviewIntroProps) {
  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="xl"
    >
      <Stack gap="lg" align="center" className="py-8">
        <div className="rounded-full bg-brand-primary/10 p-4">
          <IconCalendarWeek size={48} className="text-brand-primary" />
        </div>

        <Stack gap="md" align="center">
          <Text size="xl" fw={600} className="text-text-primary">
            Weekly Review
          </Text>
          <Text
            size="sm"
            className="max-w-md text-center text-text-secondary"
          >
            🧘 Step back from daily firefighting. Review each project, set your
            next actions, and regain clarity on all your commitments.
          </Text>
          <Stack gap={4} className="text-text-muted">
            <Text size="xs" className="text-center">
              🔒 Trust your system. 🧠 Make intuitive choices with a clear mind.
            </Text>
          </Stack>
        </Stack>

        {projectCount === 0 ? (
          <Text size="sm" className="text-text-muted">
            No active projects to review. Create a project to get started.
          </Text>
        ) : (
          <Stack gap="md" align="center">
            <Group gap="xs">
              <Text size="lg" fw={500} className="text-text-primary">
                {projectCount}
              </Text>
              <Text size="sm" className="text-text-secondary">
                active project{projectCount !== 1 ? "s" : ""} to review
              </Text>
            </Group>

            <Button
              size="lg"
              rightSection={<IconArrowRight size={18} />}
              onClick={onStart}
            >
              Start Review
            </Button>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
