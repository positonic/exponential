"use client";

import type { ReactNode } from "react";
import { Stack, Text, ThemeIcon } from "@mantine/core";
import type { MantineColor, MantineSize } from "@mantine/core";

interface EmptyStateProps {
  /** Tabler icon component to display */
  icon?: React.ComponentType<{ size?: string | number }>;
  /** Primary heading text */
  title?: string;
  /** 1-2 sentence description */
  message: string;
  /** CTA element — can be a Button, Modal trigger, or any ReactNode */
  action?: ReactNode;
  /** Compact mode for use inside dashboard cards/widgets */
  compact?: boolean;
  /** Mantine color for the icon theme */
  iconColor?: MantineColor;
  /** Icon wrapper size */
  iconSize?: MantineSize | number;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  compact = false,
  iconColor = "blue",
  iconSize,
  className,
}: EmptyStateProps) {
  if (compact) {
    return (
      <Stack gap="xs" className={className}>
        <Text size="sm" className="text-text-muted">
          {message}
        </Text>
        {action}
      </Stack>
    );
  }

  const resolvedIconSize = typeof iconSize === "number" ? iconSize : 56;

  return (
    <Stack
      align="center"
      gap="md"
      className={`py-10 ${className ?? ""}`}
    >
      {Icon && (
        <ThemeIcon
          size={resolvedIconSize}
          radius="xl"
          variant="light"
          color={iconColor}
        >
          <Icon size={resolvedIconSize * 0.5} />
        </ThemeIcon>
      )}
      {title && (
        <Text fw={600} size="lg" className="text-text-primary">
          {title}
        </Text>
      )}
      <Text
        size="sm"
        className="text-text-muted"
        ta="center"
        maw={360}
      >
        {message}
      </Text>
      {action}
    </Stack>
  );
}
