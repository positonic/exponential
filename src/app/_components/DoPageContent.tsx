"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Divider, Group, MultiSelect, Title, SegmentedControl, Modal, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconHash } from "@tabler/icons-react";
import { Actions } from "./Actions";
import { TodayLayout } from "./actions/TodayLayout";
import { TodayDesktopShell } from "./today-redesign/TodayDesktopShell";
import { ScoreBreakdown } from "./scoring/ScoreBreakdown";
import { StreakBadge } from "./scoring/StreakBadge";
import { ToolbarActions } from "./toolbar";
import { MobileTodayHeader } from "./today-mobile/MobileTodayHeader";
import { api } from "~/trpc/react";
import { useDayRollover } from "~/hooks/useDayRollover";

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

  // Fetch score data for inline display (only on "today" filter).
  // Pass client-local midnight so the lookup matches DailyPlan.date (which
  // is also stored using the client's local-midnight timestamp).
  const today = useDayRollover();
  const gamificationEnabled = preferences?.showGamification !== false;
  const { data: score } = api.scoring.getTodayScore.useQuery({ date: today }, {
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

  const isMobile = useMediaQuery("(max-width: 768px)");

  // Mobile-only task count for header subtitle. Reuses the same query the
  // TodayLayout uses, so React Query dedupes — no extra round-trip.
  // Input must match TodayLayout (undefined, not {}) to share a cache key.
  const { data: allActionsForMobile } = api.action.getAll.useQuery(
    undefined,
    { enabled: isMobile === true && filter === "today" },
  );
  const mobileTaskCount = useMemo(() => {
    if (!allActionsForMobile) return 0;
    const todayStr = today.toDateString();
    return allActionsForMobile.filter((a) => {
      if (a.status !== "ACTIVE") return false;
      const due = a.dueDate ? new Date(a.dueDate) : null;
      const sched = a.scheduledStart ? new Date(a.scheduledStart) : null;
      const ref = sched ?? due;
      return ref ? ref.toDateString() === todayStr : false;
    }).length;
  }, [allActionsForMobile, today]);

  if (isMobile && filter === "today") {
    return (
      <div className="mobile-today-page w-full">
        <MobileTodayHeader
          filter={filter}
          onFilterChange={handleFilterChange}
          taskCount={mobileTaskCount}
          score={score ?? null}
          scoreColor={score ? getScoreColor(score.totalScore) : "var(--accent-okr)"}
          onScoreClick={openBreakdown}
          tagOptions={tagOptions}
          selectedTagIds={selectedTagIds}
          onTagSelect={setSelectedTagIds}
        />

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

        <TodayLayout tagIds={selectedTagIds} />
      </div>
    );
  }

  // Desktop "today" — new redesign shell owns its own top bar and tag filter.
  if (filter === "today") {
    return (
      <TodayDesktopShell
        filter={filter}
        onFilterChange={handleFilterChange}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
      />
    );
  }

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

      {/* Actions List (filter is "tomorrow" or "upcoming" here — today is
          handled by the redesigned TodayDesktopShell above). */}
      <Actions
        viewName={getViewName(filter)}
        searchQuery={searchQuery}
        tagIds={selectedTagIds}
      />
    </>
  );
}

// Type guard
function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && ["today", "tomorrow", "upcoming"].includes(value);
}
