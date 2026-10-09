'use client';

import { Card, Group, Stack, Text } from '@mantine/core';

/** One headline number with its label, unit and a one-line hint. */
export function StatCard({
  icon,
  label,
  value,
  valueSuffix,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueSuffix?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="xs">
        <Group gap="xs">
          {icon}
          <Text size="sm" fw={500} className="text-text-secondary">
            {label}
          </Text>
        </Group>
        <Group align="baseline" gap="xs">
          <Text className="text-4xl font-bold text-accent-indigo">{value}</Text>
          {valueSuffix && (
            <Text size="sm" className="text-text-muted">
              {valueSuffix}
            </Text>
          )}
        </Group>
        {hint && (
          <Text size="xs" className="text-text-muted">
            {hint}
          </Text>
        )}
        {children}
      </Stack>
    </Card>
  );
}
