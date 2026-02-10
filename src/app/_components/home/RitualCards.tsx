"use client";

import { Card, Text, Group, Badge, Stack } from "@mantine/core";
import {
  IconCalendarWeek,
  IconUsers,
  IconClipboardCheck,
  IconArrowRight,
} from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

function WeeklyReviewCard() {
  const { workspaceSlug, workspaceId } = useWorkspace();

  const { data, isLoading } = api.weeklyReview.isCompletedThisWeek.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const isCompleted = data?.isCompleted ?? false;

  return (
    <Card
      component={Link}
      href={`/w/${workspaceSlug}/weekly-review`}
      withBorder
      radius="md"
      className="cursor-pointer border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
      p="md"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconCalendarWeek size={20} className="text-blue-400" />
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              Weekly Review
            </Text>
            <Text size="xs" className="text-text-muted">
              Review and prioritise your projects
            </Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {isLoading ? (
            <Badge variant="light" color="gray" size="sm">
              ...
            </Badge>
          ) : isCompleted ? (
            <Badge variant="light" color="green" size="sm">
              Completed
            </Badge>
          ) : (
            <Badge variant="light" color="orange" size="sm">
              Due
            </Badge>
          )}
          <IconArrowRight size={14} className="text-text-muted" />
        </Group>
      </Group>
    </Card>
  );
}

function TeamCheckinCard() {
  const { workspaceSlug } = useWorkspace();

  return (
    <Card
      component={Link}
      href={`/w/${workspaceSlug}/weekly-team-checkin`}
      withBorder
      radius="md"
      className="cursor-pointer border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
      p="md"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconUsers size={20} className="text-violet-400" />
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              Weekly Team Check-in
            </Text>
            <Text size="xs" className="text-text-muted">
              Review outcomes and projects with your team
            </Text>
          </div>
        </Group>
        <IconArrowRight size={14} className="text-text-muted" />
      </Group>
    </Card>
  );
}

function OkrCheckinCard() {
  const { workspaceSlug } = useWorkspace();

  return (
    <Card
      component={Link}
      href={`/w/${workspaceSlug}/okr-checkin`}
      withBorder
      radius="md"
      className="cursor-pointer border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
      p="md"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconClipboardCheck size={20} className="text-emerald-400" />
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              OKR Check-in
            </Text>
            <Text size="xs" className="text-text-muted">
              Update Key Result progress
            </Text>
          </div>
        </Group>
        <IconArrowRight size={14} className="text-text-muted" />
      </Group>
    </Card>
  );
}

export function RitualCards() {
  const { workspace } = useWorkspace();
  const isPersonal = workspace?.type === "personal";

  return (
    <div className="mb-6">
      <Text fw={600} size="sm" className="mb-3 text-text-secondary">
        Rituals
      </Text>
      <Stack gap="sm">
        <WeeklyReviewCard />
        <TeamCheckinCard />
        {!isPersonal && <OkrCheckinCard />}
      </Stack>
    </div>
  );
}
