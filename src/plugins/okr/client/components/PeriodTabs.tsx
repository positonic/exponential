"use client";

import { Tabs, Badge, Group, Text } from "@mantine/core";

interface PeriodTabsProps {
  selectedPeriod: "Annual" | "Q1" | "Q2" | "Q3" | "Q4";
  onPeriodChange: (period: "Annual" | "Q1" | "Q2" | "Q3" | "Q4") => void;
  counts?: Record<string, { objectives: number; keyResults: number }>;
  isLoading?: boolean;
}

export function PeriodTabs({
  selectedPeriod,
  onPeriodChange,
  counts,
  isLoading,
}: PeriodTabsProps) {
  const periods: Array<{ value: "Annual" | "Q1" | "Q2" | "Q3" | "Q4"; label: string }> = [
    { value: "Annual", label: "Annual" },
    { value: "Q1", label: "Q1" },
    { value: "Q2", label: "Q2" },
    { value: "Q3", label: "Q3" },
    { value: "Q4", label: "Q4" },
  ];

  return (
    <Tabs
      value={selectedPeriod}
      onChange={(value) => {
        if (value) {
          onPeriodChange(value as "Annual" | "Q1" | "Q2" | "Q3" | "Q4");
        }
      }}
      variant="default"
      radius="md"
      styles={{
        list: {
          borderBottom: '1px solid var(--color-border-primary)',
        },
        tab: {
          color: 'var(--color-text-secondary)',
        },
      }}
    >
      <Tabs.List>
        {periods.map((period) => {
          const count = counts?.[period.value];
          const hasData = count && (count.objectives > 0 || count.keyResults > 0);

          return (
            <Tabs.Tab
              key={period.value}
              value={period.value}
              aria-label={`${period.label} period`}
            >
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{period.label}</Text>
                {!isLoading && count && (
                  <Badge
                    size="sm"
                    variant="light"
                    color={hasData ? (selectedPeriod === period.value ? "brand" : "gray") : "gray"}
                    styles={{
                      root: {
                        backgroundColor: selectedPeriod === period.value 
                          ? 'var(--color-brand-primary)' 
                          : 'var(--color-surface-secondary)',
                        color: selectedPeriod === period.value 
                          ? 'var(--color-text-inverse)' 
                          : 'var(--color-text-secondary)',
                      },
                    }}
                  >
                    {count.objectives}/{count.keyResults}
                  </Badge>
                )}
              </Group>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
