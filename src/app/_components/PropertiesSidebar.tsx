"use client";

import { Stack, Text, Divider } from "@mantine/core";

/**
 * A single row in a properties sidebar.
 * Inline two-column layout: label left, value right.
 */
export function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 min-h-[32px]">
      <div className="flex items-center gap-2 w-28 shrink-0">
        <span className="text-text-muted">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/**
 * A divider to visually separate groups of properties.
 */
export function PropertyDivider() {
  return <Divider className="border-border-primary my-1" />;
}

/**
 * Right-side properties sidebar.
 */
export function PropertiesSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-72 shrink-0 border-l border-border-primary overflow-y-auto px-5 py-6">
      <Text
        className="text-text-muted uppercase tracking-wider font-semibold"
        size="xs"
        mb="md"
      >
        Properties
      </Text>
      <Stack gap={2}>{children}</Stack>
    </div>
  );
}
