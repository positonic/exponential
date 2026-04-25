"use client";

import { getAvatarColor } from "~/utils/avatarColors";

interface ObjectiveIndicatorProps {
  title: string;
  size?: "sm" | "md";
}

/**
 * Colored vertical bar indicator for objectives.
 * Uses a consistent color generated from the title, making each objective visually distinct.
 */
export function ObjectiveIndicator({ title, size = "md" }: ObjectiveIndicatorProps) {
  const color = getAvatarColor(title);

  return (
    <div
      className={`rounded-sm flex-shrink-0 ${size === "sm" ? "w-1 h-4" : "w-2 h-6"}`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

/**
 * Get the color for an objective by its title.
 * Useful when child components need to inherit the parent's color.
 */
export function getObjectiveColor(title: string): string {
  return getAvatarColor(title);
}
