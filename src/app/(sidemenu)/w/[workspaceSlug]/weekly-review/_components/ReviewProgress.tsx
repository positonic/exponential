"use client";

import { Text } from "@mantine/core";

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
  const remaining = Math.max(total - reviewedCount, 0);

  return (
    <div className="mb-6 rounded-md border border-border-primary bg-surface-secondary p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-[140px]">
          <Text size="sm" fw={600} className="text-text-primary">
            Project {Math.min(current, total)} of {total}
          </Text>
          <Text size="xs" className="text-text-muted">
            {reviewedCount} reviewed · {remaining} to go
          </Text>
        </div>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const isReviewed = i < reviewedCount;
            const isCurrent = !isReviewed && i === current - 1;
            return (
              <div
                key={i}
                className={
                  "h-1.5 flex-1 rounded-full transition-colors " +
                  (isReviewed
                    ? "bg-blue-500"
                    : isCurrent
                      ? "bg-blue-500/50"
                      : "bg-surface-hover")
                }
              />
            );
          })}
        </div>
        <Text size="sm" className="ml-2 font-mono text-text-muted">
          {reviewedCount} / {total}
        </Text>
      </div>
    </div>
  );
}
