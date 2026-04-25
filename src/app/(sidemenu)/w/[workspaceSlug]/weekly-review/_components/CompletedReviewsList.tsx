"use client";

import { Card, Text, Stack, Group, Badge, Skeleton } from "@mantine/core";
import { IconCalendar, IconClock, IconRocket, IconList } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

function formatWeekDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

interface CompletedReviewsListProps {
  limit?: number;
}

export function CompletedReviewsList({ limit = 5 }: CompletedReviewsListProps) {
  const { workspaceId } = useWorkspace();

  const { data: reviews, isLoading } = api.weeklyReview.getCompletedReviews.useQuery(
    { workspaceId: workspaceId ?? undefined, limit },
    { enabled: !!workspaceId }
  );

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Text size="sm" fw={500} className="text-text-secondary">
          Past Reviews
        </Text>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={60} radius="sm" />
        ))}
      </Stack>
    );
  }

  if (!reviews || reviews.length === 0) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500} className="text-text-secondary">
        Past Reviews
      </Text>
      {reviews.map((review) => {
        const totalChanges =
          review.statusChanges + review.priorityChanges + review.actionsAdded;

        return (
          <Card
            key={review.id}
            withBorder
            radius="sm"
            className="border-border-primary bg-surface-secondary"
            p="sm"
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <IconCalendar size={16} className="text-text-muted" />
                <Stack gap={2}>
                  <Text size="sm" fw={500} className="text-text-primary">
                    Week of {formatWeekDate(review.weekStartDate)}
                  </Text>
                  <Group gap="xs">
                    <Group gap={4}>
                      <IconList size={12} className="text-text-muted" />
                      <Text size="xs" className="text-text-muted">
                        {review.projectsReviewed} project
                        {review.projectsReviewed !== 1 ? "s" : ""}
                      </Text>
                    </Group>
                    {totalChanges > 0 && (
                      <Text size="xs" className="text-text-muted">
                        • {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                      </Text>
                    )}
                  </Group>
                </Stack>
              </Group>
              <Group gap="xs" wrap="nowrap">
                {review.reviewMode && (
                  <Badge
                    size="xs"
                    variant="light"
                    color={review.reviewMode === "quick" ? "cyan" : "blue"}
                    leftSection={
                      review.reviewMode === "quick" ? (
                        <IconRocket size={10} />
                      ) : null
                    }
                  >
                    {review.reviewMode === "quick" ? "Quick" : "Full"}
                  </Badge>
                )}
                {review.durationMinutes !== null && review.durationMinutes > 0 && (
                  <Group gap={4}>
                    <IconClock size={12} className="text-text-muted" />
                    <Text size="xs" className="text-text-muted">
                      {review.durationMinutes}m
                    </Text>
                  </Group>
                )}
              </Group>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
