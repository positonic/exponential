"use client";

import { Group, Text, Progress } from "@mantine/core";

interface ReviewProgressProps {
  current: number;
  total: number;
  reviewedCount: number;
}

export function ReviewProgress({
  current,
  total,
  reviewedCount,
}: ReviewProgressProps) {
  const progressPercent = (current / total) * 100;

  return (
    <div className="mb-6">
      <Group justify="space-between" className="mb-2">
        <Text size="sm" className="text-text-secondary">
          Project {current} of {total}
        </Text>
        <Text size="sm" className="text-text-muted">
          {reviewedCount} reviewed
        </Text>
      </Group>
      <Progress value={progressPercent} size="sm" radius="xl" />
    </div>
  );
}
