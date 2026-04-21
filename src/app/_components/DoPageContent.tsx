"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Divider, Group, MultiSelect, Title, SegmentedControl, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCalendarEvent, IconHash } from "@tabler/icons-react";
import { Actions } from "./Actions";
import { TodayView } from "./today/TodayView";
import { ScoreBreakdown } from "./scoring/ScoreBreakdown";
import { StreakBadge } from "./scoring/StreakBadge";
import { ToolbarActions } from "./toolbar";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const tagsQuery = api.tag.list.useQuery();
  const tagOptions = useMemo(
    () =>
      tagsQuery.data?.allTags?.map((tag: { id: string; name: string }) => ({
        value: tag.id.toString(),
        label: tag.name,
      })) ?? [],
    [tagsQuery.data],
  );

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
      <div className="mb-4 w-full">
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
              <>
                <button
                  onClick={openBreakdown}
                  className="flex items-baseline gap-2 text-left transition-opacity hover:opacity-80"
                >
                  <Text className="text-text-muted text-xs font-medium uppercase tracking-wider">
                    Daily Score
                  </Text>
                  <Text
                    className="text-2xl font-semibold leading-none"
                    style={{ color: getScoreColor(score.totalScore) }}
                  >
                    {score.totalScore}
                  </Text>
                  <Text className="text-text-muted text-sm">/100</Text>
                  {streak && streak.currentStreak > 0 && (
                    <StreakBadge streakCount={streak.currentStreak} streakType="daily_planning" />
                  )}
                </button>
                <Divider orientation="vertical" className="border-border-primary" />
              </>
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

      {/* Tag Filter Row */}
      {tagOptions.length > 0 && (
        <div className="mb-3 flex justify-end">
          <MultiSelect
            data={tagOptions}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            placeholder="Filter by tags..."
            leftSection={<IconHash size={16} />}
            clearable
            searchable
            size="sm"
            maxDropdownHeight={240}
            styles={{
              input: {
                backgroundColor: "var(--color-surface-secondary)",
                borderColor: "var(--color-border-primary)",
                minWidth: 260,
              },
              dropdown: {
                backgroundColor: "var(--color-surface-secondary)",
                borderColor: "var(--color-border-primary)",
              },
            }}
          />
        </div>
      )}

      {/* Actions List */}
      {filter === "today" ? (
        <TodayView tagIds={selectedTagIds} />
      ) : (
        <Actions
          viewName={getViewName(filter)}
          searchQuery={searchQuery}
          tagIds={selectedTagIds}
        />
      )}
    </>
  );
}

// Type guard
function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && ["today", "tomorrow", "upcoming"].includes(value);
}
