"use client";

import { Badge, Group } from "@mantine/core";
import { type RouterOutputs } from "~/trpc/react";

type Outcome = RouterOutputs["outcome"]["getMyOutcomes"][0];

interface OutcomeBadgesProps {
  outcomes: Outcome[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function OutcomeBadges({ outcomes, size = "sm" }: OutcomeBadgesProps) {
  if (!outcomes || outcomes.length === 0) {
    return (
      <Badge variant="light" color="gray" size={size}>
        No outcomes
      </Badge>
    );
  }

  return (
    <Group gap="xs">
      {outcomes.map((outcome) => (
        <Badge
          key={outcome.id}
          variant="light"
          color="blue"
          size={size}
          style={{ maxWidth: '200px' }}
          className="text-ellipsis overflow-hidden"
        >
          {outcome.description}
        </Badge>
      ))}
    </Group>
  );
}