"use client";

import { Tabs, Skeleton } from "@mantine/core";
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
      <Tabs value={null} variant="pills" radius="xl">
        <Tabs.List>
          <Skeleton height={30} width={80} radius="xl" />
          <Skeleton height={30} width={80} radius="xl" />
          <Skeleton height={30} width={80} radius="xl" />
        </Tabs.List>
      </Tabs>
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
    <Tabs 
      value={activeViewId} 
      onChange={(value) => {
        if (value === DEFAULT_VIEW_CONFIG.id) {
          onViewChange(allItemsView);
        } else {
          const view = views?.find((v) => v.id === value);
          if (view) {
            onViewChange({
              id: view.id,
              name: view.name,
              viewType: view.viewType as ViewType,
              groupBy: view.groupBy as ViewGroupBy,
              filters: (view.filters as ViewFilters) ?? {},
            });
          }
        }
      }}
      variant="pills"
      radius="xl"
    >
      <Tabs.List>
        <Tabs.Tab value={DEFAULT_VIEW_CONFIG.id}>
          {DEFAULT_VIEW_CONFIG.name}
        </Tabs.Tab>
        {views?.map((view) => (
          <Tabs.Tab key={view.id} value={view.id}>
            {view.name}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
