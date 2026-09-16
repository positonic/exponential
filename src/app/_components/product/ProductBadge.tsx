"use client";

import { Group, Text } from "@mantine/core";
import { getAvatarColor, getInitial } from "~/utils/avatarColors";

export interface ProductBadgeProduct {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

/**
 * Small colored chip identifying a Feature's owning Product. `Product.icon` /
 * `Product.color` are free-text and often unset, so fall back to a
 * deterministic avatar color + the product's initial. Used by the Product
 * Roadmap cards and the Objective page's Features tab.
 */
export function ProductBadge({ product }: { product: ProductBadgeProduct }) {
  const dotStyle = {
    backgroundColor: product.color ?? getAvatarColor(product.id),
  };

  return (
    <Group gap={6} wrap="nowrap" align="center" className="min-w-0">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] leading-none"
        style={dotStyle}
        aria-hidden
      >
        {product.icon ?? getInitial(product.name)}
      </span>
      <Text size="xs" className="text-text-muted truncate">
        {product.name}
      </Text>
    </Group>
  );
}
