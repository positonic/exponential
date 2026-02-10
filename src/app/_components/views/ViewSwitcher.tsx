"use client";

import { Button, Group, ScrollArea, Skeleton } from "@mantine/core";
import { api } from "~/trpc/react";
import { DEFAULT_VIEW_CONFIG } from "~/types/view";
import type { ViewFilters, ViewType, ViewGroupBy } from "~/types/view";

export interface ViewConfig {
  id: string;
  name: string;
  viewType: ViewType;
  groupBy: ViewGroupBy;
  filters: ViewFilters;
  isVirtual?: boolean;
}

interface ViewSwitcherProps {
  workspaceId: string;
  activeViewId: string;
  onViewChange: (view: ViewConfig) => void;
}

export function ViewSwitcher({
  workspaceId,
  activeViewId,
  onViewChange,
}: ViewSwitcherProps) {
  const { data: views, isLoading } = api.view.list.useQuery({ workspaceId });

  if (isLoading) {
    return (
      <Group gap="xs">
        <Skeleton height={30} width={80} radius="xl" />
        <Skeleton height={30} width={80} radius="xl" />
        <Skeleton height={30} width={80} radius="xl" />
      </Group>
    );
  }

  const allItemsView: ViewConfig = {
    id: DEFAULT_VIEW_CONFIG.id,
    name: DEFAULT_VIEW_CONFIG.name,
    viewType: DEFAULT_VIEW_CONFIG.viewType,
    groupBy: DEFAULT_VIEW_CONFIG.groupBy,
    filters: DEFAULT_VIEW_CONFIG.filters,
    isVirtual: true,
  };

  return (
    <ScrollArea type="auto" offsetScrollbars scrollbarSize={4}>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="xs"
          radius="xl"
          variant={activeViewId === DEFAULT_VIEW_CONFIG.id ? "filled" : "light"}
          onClick={() => onViewChange(allItemsView)}
        >
          {DEFAULT_VIEW_CONFIG.name}
        </Button>
        {views?.map((view) => (
          <Button
            key={view.id}
            size="xs"
            radius="xl"
            variant={activeViewId === view.id ? "filled" : "light"}
            onClick={() =>
              onViewChange({
                id: view.id,
                name: view.name,
                viewType: view.viewType as ViewType,
                groupBy: view.groupBy as ViewGroupBy,
                filters: (view.filters as ViewFilters) ?? {},
              })
            }
          >
            {view.name}
          </Button>
        ))}
      </Group>
    </ScrollArea>
  );
}
