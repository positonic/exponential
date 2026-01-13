"use client";

import { useEffect, useRef } from "react";
import { Card, Text, Stack, Button, Group } from "@mantine/core";
import { IconCheck, IconHome, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  outcomesChanged: boolean;
}

interface ReviewCompletionProps {
  totalProjects: number;
  reviewedCount: number;
  changes: Map<string, ProjectChanges>;
  onRestart: () => void;
}

export function ReviewCompletion({
  totalProjects,
  reviewedCount,
  changes,
  onRestart,
}: ReviewCompletionProps) {
  const { workspace, workspaceId } = useWorkspace();
  const hasMarkedComplete = useRef(false);

  // Calculate summary stats
  let statusChanges = 0;
  let priorityChanges = 0;
  let actionsAdded = 0;
  let outcomesChanged = 0;

  changes.forEach((change) => {
    if (change.statusChanged) statusChanges++;
    if (change.priorityChanged) priorityChanges++;
    if (change.actionAdded) actionsAdded++;
    if (change.outcomesChanged) outcomesChanged++;
  });

  // Mark review as complete when component mounts
  const markComplete = api.weeklyReview.markComplete.useMutation();

  useEffect(() => {
    if (!hasMarkedComplete.current && workspaceId) {
      hasMarkedComplete.current = true;
      markComplete.mutate({
        workspaceId,
        projectsReviewed: reviewedCount,
        statusChanges,
        priorityChanges,
        actionsAdded,
      });
    }
  }, [workspaceId, reviewedCount, statusChanges, priorityChanges, actionsAdded, markComplete]);

  const hasChanges =
    statusChanges > 0 ||
    priorityChanges > 0 ||
    actionsAdded > 0 ||
    outcomesChanged > 0;

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="xl"
    >
      <Stack gap="lg" align="center" className="py-8">
        <div className="rounded-full bg-green-500/10 p-4">
          <IconCheck size={48} className="text-green-500" />
        </div>

        <Stack gap="xs" align="center">
          <Text size="xl" fw={600} className="text-text-primary">
            Review Complete
          </Text>
          <Text size="sm" className="text-text-secondary">
            You reviewed {reviewedCount} of {totalProjects} project
            {totalProjects !== 1 ? "s" : ""}
          </Text>
        </Stack>

        {hasChanges && (
          <Card
            withBorder
            radius="sm"
            className="w-full max-w-sm border-border-primary bg-background-primary"
            p="md"
          >
            <Text size="sm" fw={500} className="mb-3 text-text-primary">
              Changes Made
            </Text>
            <Stack gap="xs">
              {statusChanges > 0 && (
                <Group gap="xs">
                  <Text size="sm" className="text-text-secondary">
                    Status updates:
                  </Text>
                  <Text size="sm" fw={500} className="text-text-primary">
                    {statusChanges}
                  </Text>
                </Group>
              )}
              {priorityChanges > 0 && (
                <Group gap="xs">
                  <Text size="sm" className="text-text-secondary">
                    Priority updates:
                  </Text>
                  <Text size="sm" fw={500} className="text-text-primary">
                    {priorityChanges}
                  </Text>
                </Group>
              )}
              {actionsAdded > 0 && (
                <Group gap="xs">
                  <Text size="sm" className="text-text-secondary">
                    Actions added:
                  </Text>
                  <Text size="sm" fw={500} className="text-text-primary">
                    {actionsAdded}
                  </Text>
                </Group>
              )}
              {outcomesChanged > 0 && (
                <Group gap="xs">
                  <Text size="sm" className="text-text-secondary">
                    Outcomes updated:
                  </Text>
                  <Text size="sm" fw={500} className="text-text-primary">
                    {outcomesChanged}
                  </Text>
                </Group>
              )}
            </Stack>
          </Card>
        )}

        <Group gap="md">
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={16} />}
            onClick={onRestart}
          >
            Review Again
          </Button>
          <Button
            component={Link}
            href={workspace ? `/w/${workspace.slug}/home` : "/home"}
            leftSection={<IconHome size={16} />}
          >
            Back to Home
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
