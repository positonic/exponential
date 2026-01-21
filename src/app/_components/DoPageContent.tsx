"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Title, SegmentedControl, ActionIcon } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";
import { Actions } from "./Actions";

export type DoFilter = "today" | "tomorrow" | "upcoming";

interface DoPageContentProps {
  initialFilter?: DoFilter;
}

export function DoPageContent({ initialFilter = "today" }: DoPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

          {/* Right side: Filter selector */}
          <Group gap="sm" wrap="nowrap">
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

      {/* Actions List */}
      <Actions viewName={getViewName(filter)} />
    </>
  );
}

// Type guard
function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && ["today", "tomorrow", "upcoming"].includes(value);
}
