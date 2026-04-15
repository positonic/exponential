"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Group, Title, SegmentedControl, Modal, Text, Collapse } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCalendarEvent, IconCircleDot, IconFlag } from "@tabler/icons-react";
import { PRIORITY_VALUES } from "~/types/priority";
import { Actions } from "./Actions";
import { ScoreBreakdown } from "./scoring/ScoreBreakdown";
import { StreakBadge } from "./scoring/StreakBadge";
import { ToolbarActions } from "./toolbar";
import { FilterBar } from "./filters";
import { hasActiveFilters } from "~/types/filter";
import type { FilterBarConfig, FilterState } from "~/types/filter";
import { api } from "~/trpc/react";

const ACTION_FILTER_CONFIG: FilterBarConfig = {
  fields: [
    {
      key: "status",
      label: "Status",
      type: "multi-select",
      icon: IconCircleDot,
      badgeColor: "cyan",
      options: [
        { value: "ACTIVE", label: "Active" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "multi-select",
      icon: IconFlag,
      badgeColor: "grape",
      options: PRIORITY_VALUES.map((v) => ({ value: v, label: v })),
    },
  ],
};

export type DoFilter = "today" | "tomorrow" | "upcoming";

interface DoPageContentProps {
  initialFilter?: DoFilter;
}

export function DoPageContent({ initialFilter = "today" }: DoPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: preferences } = api.navigationPreference.getPreferences.useQuery();
  const [breakdownOpened, { open: openBreakdown, close: closeBreakdown }] = useDisclosure(false);
  const [filters, setFilters] = useState<FilterState>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);

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
            {filter === "today" && (
              <Button
                component={Link}
                href="/daily-plan"
                variant="subtle"
                size="sm"
                leftSection={<IconCalendarEvent size={16} />}
              >
                Daily plan
              </Button>
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
            <ToolbarActions
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search actions..."
              hasFilter
              hasActiveFilters={hasActiveFilters(ACTION_FILTER_CONFIG, filters)}
              onToggleFilter={toggleFilterRow}
            />
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

      {/* Filter Row */}
      <Collapse in={filterRowOpen || hasActiveFilters(ACTION_FILTER_CONFIG, filters)}>
        <div className="mb-3">
          <FilterBar
            config={ACTION_FILTER_CONFIG}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </Collapse>

      {/* Actions List */}
      <Actions viewName={getViewName(filter)} searchQuery={searchQuery} filters={filters} />
    </>
  );
}

// Type guard
function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && ["today", "tomorrow", "upcoming"].includes(value);
}
