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
 *
 * A fixed 18rem column from the `lg` breakpoint up. Below that it becomes a
 * full-width block (top border, no side padding) so a detail page can stack
 * it under the main content instead of squeezing the content into whatever
 * is left beside the column — on a phone that was ~24px.
 */
export function PropertiesSidebar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full lg:w-72 shrink-0 mt-6 lg:mt-0 border-t lg:border-t-0 lg:border-l border-border-primary overflow-y-auto px-0 lg:px-5 py-6 ${className ?? ""}`}
    >
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
