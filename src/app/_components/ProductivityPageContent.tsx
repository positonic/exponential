"use client";

import { Title, Text, Stack, Group, Card, Loader } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { DailyScoreCard } from "./scoring/DailyScoreCard";
import { ProductivityChart } from "./scoring/ProductivityChart";
import { StreakBadge } from "./scoring/StreakBadge";

export function ProductivityPageContent() {
  const { data: preferences, isLoading: prefsLoading } =
    api.navigationPreference.getPreferences.useQuery();

  const { data: streaks, isLoading: streaksLoading } =
    api.scoring.getStreaks.useQuery({});

  const { data: stats } = api.scoring.getProductivityStats.useQuery({});

  if (prefsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader size="lg" />
      </div>
    );
  }

  if (preferences?.showGamification === false) {
    return (
      <Stack align="center" gap="md" py={60}>
        <Text className="text-text-secondary text-center">
          Productivity scoring is currently disabled.
        </Text>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm text-brand-primary hover:underline"
        >
          <IconSettings size={16} />
          Enable in Settings
        </Link>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" className="w-full">
      {/* Page Header */}
      <div>
        <Title order={2} size="h3" className="text-text-primary">
          Productivity
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          Track your daily scores, streaks, and trends
        </Text>
      </div>

      {/* Today's Score */}
      <DailyScoreCard />

      {/* Streaks */}
      {!streaksLoading && streaks && streaks.length > 0 && (
        <Card className="bg-surface-primary border-border-primary">
          <Text className="text-text-primary font-semibold mb-3">Streaks</Text>
          <Group gap="md">
            {streaks.map((streak) => (
              <StreakBadge
                key={streak.id}
                streakCount={streak.currentStreak}
                streakType={streak.streakType as "daily_planning" | "habits" | "weekly_review"}
                size="lg"
              />
            ))}
          </Group>
        </Card>
      )}

      {/* Stats Summary */}
      {stats && (
        <Card className="bg-surface-primary border-border-primary">
          <Text className="text-text-primary font-semibold mb-3">Statistics</Text>
          <Group gap="xl">
            <div>
              <Text className="text-text-muted text-xs">Today</Text>
              <Text className="text-text-primary text-lg font-bold">{stats.today}</Text>
            </div>
            <div>
              <Text className="text-text-muted text-xs">7-Day Avg</Text>
              <Text className="text-text-primary text-lg font-bold">{stats.week}</Text>
            </div>
            <div>
              <Text className="text-text-muted text-xs">30-Day Avg</Text>
              <Text className="text-text-primary text-lg font-bold">{stats.month}</Text>
            </div>
            <div>
              <Text className="text-text-muted text-xs">Consistency</Text>
              <Text className="text-text-primary text-lg font-bold">{stats.consistency}%</Text>
            </div>
          </Group>
        </Card>
      )}

      {/* 30-Day Chart */}
      <ProductivityChart />
    </Stack>
  );
}
