"use client";

import { Group, Stack, Text, Divider } from "@mantine/core";

/**
 * A single row in a properties sidebar.
 * Renders an icon + label header with a value indented below.
 *
 * @example
 * <PropertyRow icon={<IconCircleDot size={16} />} label="Status">
 *   <Select ... />
 * </PropertyRow>
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
    <div>
      <Group gap="xs" mb={4}>
        <span className="text-text-muted">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </Group>
      <div className="ml-6">{children}</div>
    </div>
  );
}

/**
 * A divider to visually separate groups of properties
 * (e.g. editable fields above, metadata below).
 */
export function PropertyDivider() {
  return <Divider className="border-border-primary" />;
}

/**
 * Right-side properties sidebar matching the action detail page pattern.
 * Pass PropertyRow / PropertyDivider children to populate it.
 *
 * @example
 * <PropertiesSidebar>
 *   <PropertyRow icon={...} label="Status">...</PropertyRow>
 *   <PropertyDivider />
 *   <PropertyRow icon={...} label="Created">...</PropertyRow>
 * </PropertiesSidebar>
 */
export function PropertiesSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-80 shrink-0 border-l border-border-primary overflow-y-auto p-6 bg-surface-secondary/30">
      <Text
        className="text-text-muted uppercase tracking-wider font-semibold"
        size="xs"
        mb="lg"
      >
        Properties
      </Text>
      <Stack gap="lg">{children}</Stack>
    </div>
  );
}
