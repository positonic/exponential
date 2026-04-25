"use client";

import { Paper, Group, Text, CloseButton } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import { useHomeTileVisibility } from "~/hooks/useHomeTileVisibility";

interface HomeTileProps {
  tileId: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Additional condition that hides the tile (e.g., API says completed) */
  hidden?: boolean;
  /** Optional gradient border+background classes */
  gradientClassName?: string;
}

export function HomeTile({
  tileId,
  href,
  icon,
  title,
  description,
  hidden = false,
  gradientClassName,
}: HomeTileProps) {
  const { isHidden, dismiss, markVisited } = useHomeTileVisibility(tileId);

  if (hidden || isHidden) {
    return null;
  }

  const borderClass =
    gradientClassName ??
    "border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover";

  return (
    <Paper
      component={Link}
      href={href}
      onClick={markVisited}
      p="md"
      radius="md"
      className={`flex h-full cursor-pointer flex-col justify-between border ${borderClass} transition-opacity hover:opacity-90`}
      style={{ textDecoration: "none" }}
    >
      <Group gap="sm" wrap="nowrap" mb="xs">
        {icon}
        <Text fw={600} size="sm" className="text-text-primary">
          {title}
        </Text>
        <CloseButton
          size="xs"
          onClick={dismiss}
          aria-label={`Dismiss ${title}`}
          className="ml-auto"
        />
      </Group>
      <Text size="xs" className="text-text-muted">
        {description}
      </Text>
      <IconArrowRight
        size={14}
        className="mt-auto self-end text-text-muted"
      />
    </Paper>
  );
}
