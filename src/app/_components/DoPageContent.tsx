"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Title, SegmentedControl, ActionIcon, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconFilter } from "@tabler/icons-react";
import { Actions } from "./Actions";
import { ScoreBreakdown } from "./scoring/ScoreBreakdown";
import { StreakBadge } from "./scoring/StreakBadge";
import { api } from "~/trpc/react";

export type DoFilter = "today" | "tomorrow" | "upcoming";

interface DoPageContentProps {
  initialFilter?: DoFilter;
}

export function DoPageContent({ initialFilter = "today" }: DoPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: preferences } = api.navigationPreference.getPreferences.useQuery();
  const [breakdownOpened, { open: openBreakdown, close: closeBreakdown }] = useDisclosure(false);

  // Fetch score data for inline display (only on "today" filter)
  const gamificationEnabled = preferences?.showGamification !== false;
  const { data: score } = api.scoring.getTodayScore.useQuery({}, {
    enabled: gamificationEnabled,
  });
  const { data: streak } = api.scoring.getStreakByType.useQuery({
    streakType: "daily_planning",
  }, {
    enabled: gamificationEnabled,
  });

  // Read filter from URL, fall back to initial or default to 'today'
  const filterFromUrl = searchParams.get("filter");
  const filter: DoFilter = isValidDoFilter(filterFromUrl)
    ? filterFromUrl
    : initialFilter;

  const handleFilterChange = useCallback(
    (newFilter: DoFilter) => {
      const params = new URLSearchParams(searchParams.toString());

      // Update filter param
      if (newFilter === "today") {
        params.delete("filter");
      } else {
        params.set("filter", newFilter);
      }

      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  // Map filter to viewName for Actions component
  const getViewName = (f: DoFilter): string => {
    switch (f) {
      case "today":
        return "today";
      case "tomorrow":
        return "tomorrow";
      case "upcoming":
        return "upcoming";
      default:
        return "today";
    }
  };

  // Get title based on filter
  const getTitle = (f: DoFilter): string => {
    switch (f) {
      case "today":
        return "Today";
      case "tomorrow":
        return "Tomorrow";
      case "upcoming":
        return "Upcoming";
      default:
        return "Today";
    }
  };

  // Determine score color
  const getScoreColor = (totalScore: number) => {
    if (totalScore >= 80) return "var(--mantine-color-green-6)";
    if (totalScore >= 60) return "var(--mantine-color-blue-6)";
    if (totalScore >= 40) return "var(--mantine-color-yellow-6)";
    return "var(--mantine-color-orange-6)";
  };

  const showScore = filter === "today" && preferences?.showGamification !== false && score;

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left side: Page title */}
          <div>
            <Title order={2} size="h3" className="text-text-primary">
              {getTitle(filter)}
            </Title>
          </div>

          {/* Right side: Filter selector + inline score */}
          <Group gap="md" wrap="nowrap" className="items-center">
            {showScore && (
              <button
                onClick={openBreakdown}
                className="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
              >
                <div>
                  <Text className="text-text-muted text-xs leading-tight">Daily Score</Text>
                  <Group gap={4} className="items-baseline">
                    <Text className="text-2xl font-bold leading-tight" style={{ color: getScoreColor(score.totalScore) }}>
                      {score.totalScore}
                    </Text>
                    <Text className="text-text-muted text-xs">/100</Text>
                  </Group>
                </div>
                {streak && streak.currentStreak > 0 && (
                  <StreakBadge streakCount={streak.currentStreak} streakType="daily_planning" />
                )}
              </button>
            )}
            <SegmentedControl
              value={filter}
              onChange={(value) => handleFilterChange(value as DoFilter)}
              data={[
                { label: "Today", value: "today" },
                { label: "Tomorrow", value: "tomorrow" },
                { label: "Upcoming", value: "upcoming" },
              ]}
              size="sm"
            />
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Filter"
              className="text-text-secondary hover:text-text-primary"
            >
              <IconFilter size={18} />
            </ActionIcon>
          </Group>
        </div>
      </div>

      {/* Score Breakdown Modal */}
      {score && (
        <Modal
          opened={breakdownOpened}
          onClose={closeBreakdown}
          title="Daily Productivity Score"
          size="md"
          overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        >
          <ScoreBreakdown score={score} />
        </Modal>
      )}

      {/* Actions List */}
      <Actions viewName={getViewName(filter)} />
    </>
  );
}

// Type guard
function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && ["today", "tomorrow", "upcoming"].includes(value);
}
