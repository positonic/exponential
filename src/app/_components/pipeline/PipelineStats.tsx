"use client";

import { SimpleGrid, Paper, Text, Group, Stack } from "@mantine/core";
import {
  IconCurrencyDollar,
  IconTarget,
  IconTrendingUp,
  IconCheck,
} from "@tabler/icons-react";

interface PipelineStatsProps {
  stats: {
    totalDeals: number;
    totalValue: number;
    weightedValue: number;
    openDeals: number;
    wonDeals: number;
    lostDeals: number;
    wonValue: number;
    conversionRate: number;
  };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const statCards = [
  {
    key: "totalValue",
    label: "Pipeline Value",
    icon: IconCurrencyDollar,
    color: "blue",
    format: (stats: PipelineStatsProps["stats"]) => formatCurrency(stats.totalValue),
    sub: (stats: PipelineStatsProps["stats"]) => `${stats.openDeals} open deals`,
  },
  {
    key: "weightedValue",
    label: "Weighted Value",
    icon: IconTarget,
    color: "violet",
    format: (stats: PipelineStatsProps["stats"]) => formatCurrency(stats.weightedValue),
    sub: () => "Adjusted by probability",
  },
  {
    key: "wonValue",
    label: "Won Revenue",
    icon: IconCheck,
    color: "green",
    format: (stats: PipelineStatsProps["stats"]) => formatCurrency(stats.wonValue),
    sub: (stats: PipelineStatsProps["stats"]) => `${stats.wonDeals} deals won`,
  },
  {
    key: "conversionRate",
    label: "Conversion Rate",
    icon: IconTrendingUp,
    color: "orange",
    format: (stats: PipelineStatsProps["stats"]) =>
      `${(stats.conversionRate * 100).toFixed(0)}%`,
    sub: (stats: PipelineStatsProps["stats"]) =>
      `${stats.wonDeals + stats.lostDeals} deals closed`,
  },
];

export function PipelineStats({ stats }: PipelineStatsProps) {
  if (stats.totalDeals === 0) return null;

  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} mb="lg">
      {statCards.map((card) => {
        const Icon = card.icon;
        return (
          <Paper key={card.key} p="md" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="xs" className="text-text-muted" tt="uppercase" fw={600}>
                {card.label}
              </Text>
              <Icon size={16} className="text-text-muted" />
            </Group>
            <Stack gap={2}>
              <Text fw={700} size="xl">
                {card.format(stats)}
              </Text>
              <Text size="xs" className="text-text-muted">
                {card.sub(stats)}
              </Text>
            </Stack>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}
