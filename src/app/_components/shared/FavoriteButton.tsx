"use client";

import React from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useFavorite, type FavoriteTarget } from "./useFavorite";

interface FavoriteButtonProps extends FavoriteTarget {
  size?: string | number;
  variant?: string;
  iconSize?: number;
  /** CSS color for the filled (favourited) star. Defaults to the warning gold. */
  color?: string;
}

/**
 * Reusable star toggle for favouriting any entity or page. Drives its state
 * from `useFavorite`, so dropping it into a header/row is all that's needed to
 * make that surface favouritable. Pass page details (label/icon/workspaceId)
 * for "page" favourites; entity favourites only need entityType + entityId.
 */
export function FavoriteButton({
  size = "md",
  variant = "subtle",
  iconSize = 16,
  color = "var(--color-brand-warning)",
  ...target
}: FavoriteButtonProps) {
  const { favorited, toggle } = useFavorite(target);
  const label = favorited ? "Remove from favourites" : "Add to favourites";

  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant={variant}
        size={size}
        aria-label={label}
        aria-pressed={favorited}
        onClick={toggle}
      >
        {favorited ? (
          <IconStarFilled size={iconSize} style={{ color }} />
        ) : (
          <IconStar size={iconSize} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}
