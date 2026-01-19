"use client";

import {
  Card,
  Title,
  Text,
  SimpleGrid,
  Group,
  Badge,
  Loader,
  Stack,
} from "@mantine/core";
import { IconCalendar, IconTarget, IconTrendingUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface PeriodSelectorProps {
  workspaceId: string;
  onSelect: (period: string) => void;
}

export function PeriodSelector({ workspaceId, onSelect }: PeriodSelectorProps) {
  const { data: periods, isLoading: periodsLoading } = api.okr.getPeriods.useQuery();
  const { data: stats } = api.okr.getStats.useQuery({ workspaceId });

  // Get current quarter
  const now = new Date();
  const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}-${now.getFullYear()}`;

  // Group periods by year
  const periodsByYear = periods?.reduce(
    (acc, period) => {
      const year = period.value.split("-")[1];
      if (year) {
        if (!acc[year]) {
          acc[year] = [];
        }
        acc[year].push(period);
      }
      return acc;
    },
    {} as Record<string, typeof periods>
  );

  if (periodsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <Stack gap="lg">
      {/* Stats Overview */}
      {stats && (
        <Card withBorder p="md">
          <Group justify="space-between">
            <Group gap="xl">
              <div className="text-center">
                <Text size="xl" fw={700} className="text-text-primary">
                  {stats.totalObjectives}
                </Text>
                <Text size="xs" c="dimmed">Objectives</Text>
              </div>
              <div className="text-center">
                <Text size="xl" fw={700} className="text-text-primary">
                  {stats.totalKeyResults}
                </Text>
                <Text size="xs" c="dimmed">Key Results</Text>
              </div>
              <div className="text-center">
                <Text size="xl" fw={700} className="text-brand-primary">
                  {stats.averageProgress}%
                </Text>
                <Text size="xs" c="dimmed">Avg Progress</Text>
              </div>
            </Group>
            <Group gap="xs">
              <Badge color="green" variant="light">
                {stats.statusBreakdown.onTrack} on track
              </Badge>
              <Badge color="yellow" variant="light">
                {stats.statusBreakdown.atRisk} at risk
              </Badge>
              <Badge color="red" variant="light">
                {stats.statusBreakdown.offTrack} off track
              </Badge>
              <Badge color="blue" variant="light">
                {stats.statusBreakdown.achieved} achieved
              </Badge>
            </Group>
          </Group>
        </Card>
      )}

      {/* Period Selection */}
      <div>
        <Title order={3} mb="md" className="text-text-primary">
          Select a Period to Review
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Choose which OKR period you want to check-in on. Your current quarter is highlighted.
        </Text>

        {periodsByYear &&
          Object.entries(periodsByYear)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([year, yearPeriods]) => (
              <div key={year} className="mb-6">
                <Text size="sm" fw={600} c="dimmed" mb="sm">
                  {year}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                  {yearPeriods
                    ?.filter((p) => p.value.startsWith("Q"))
                    .map((period) => (
                      <PeriodCard
                        key={period.value}
                        period={period}
                        isCurrent={period.value === currentQuarter}
                        workspaceId={workspaceId}
                        onSelect={onSelect}
                      />
                    ))}
                </SimpleGrid>

                {/* Half-year and Annual periods */}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
                  {yearPeriods
                    ?.filter((p) => !p.value.startsWith("Q"))
                    .map((period) => (
                      <PeriodCard
                        key={period.value}
                        period={period}
                        isCurrent={false}
                        workspaceId={workspaceId}
                        onSelect={onSelect}
                      />
                    ))}
                </SimpleGrid>
              </div>
            ))}
      </div>
    </Stack>
  );
}

interface PeriodCardProps {
  period: { value: string; label: string };
  isCurrent: boolean;
  workspaceId: string;
  onSelect: (period: string) => void;
}

function PeriodCard({ period, isCurrent, workspaceId, onSelect }: PeriodCardProps) {
  // Get count of KRs for this period
  const { data: keyResults } = api.okr.getAll.useQuery({
    workspaceId,
    period: period.value,
  });

  const krCount = keyResults?.length ?? 0;

  return (
    <Card
      withBorder
      p="md"
      className={`cursor-pointer transition-all hover:border-brand-primary ${
        isCurrent ? "border-brand-primary bg-surface-secondary" : ""
      }`}
      onClick={() => onSelect(period.value)}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconCalendar size={16} className="text-text-muted" />
          <Text fw={500} className="text-text-primary">
            {period.label.split(" (")[0]}
          </Text>
        </Group>
        {isCurrent && (
          <Badge size="sm" color="blue" variant="light">
            Current
          </Badge>
        )}
      </Group>

      <Text size="xs" c="dimmed" mb="sm">
        {period.label.match(/\(([^)]+)\)/)?.[1] ?? ""}
      </Text>

      <Group gap="md">
        <Group gap={4}>
          <IconTarget size={14} className="text-text-muted" />
          <Text size="sm" c="dimmed">
            {krCount} Key Results
          </Text>
        </Group>
        {krCount > 0 && (
          <Group gap={4}>
            <IconTrendingUp size={14} className="text-green-500" />
            <Text size="sm" c="dimmed">
              Ready to review
            </Text>
          </Group>
        )}
      </Group>
    </Card>
  );
}
