"use client";

import { Tabs } from "@mantine/core";
import { IconTarget, IconChartBar } from "@tabler/icons-react";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { OkrDashboard } from "~/plugins/okr/client/components/OkrDashboard";
import { GoalsViewToggles } from "./GoalsViewToggles";
import { useGoalsViewParams, type GoalsTab } from "./useGoalsViewParams";

/**
 * The goals page body: Goals / OKRs tabs with the "Mine" and "Timeline"
 * toggles beside them. Both toggles apply to whichever tab is active, so
 * there is no separate "My Goals" tab and Timeline is not a period.
 */
export function GoalsWorkspaceTabs() {
  const { tab, onlyMine, view, setTab, setOnlyMine, setView } =
    useGoalsViewParams();

  return (
    <Tabs
      value={tab}
      onChange={(value) => {
        if (value) setTab(value as GoalsTab);
      }}
      className="w-full"
      // Mantine keeps inactive panels mounted by default, which had both
      // dashboards fetching at once — including getByObjective, the page's
      // heaviest query — for a panel nobody was looking at.
      keepMounted={false}
    >
      <div className="flex items-center gap-4 border-b border-border-primary px-10">
        <Tabs.List className="flex-1">
          <Tabs.Tab value="goals" fz="xs" leftSection={<IconTarget size={16} />}>
            Goals
          </Tabs.Tab>
          <Tabs.Tab value="okrs" fz="xs" leftSection={<IconChartBar size={16} />}>
            OKRs
          </Tabs.Tab>
        </Tabs.List>
        <GoalsViewToggles
          onlyMine={onlyMine}
          view={view}
          onOnlyMineChange={setOnlyMine}
          onViewChange={setView}
        />
      </div>

      <Tabs.Panel value="goals">
        <InitiativeDashboard onlyMine={onlyMine} view={view} />
      </Tabs.Panel>

      <Tabs.Panel value="okrs">
        <OkrDashboard onlyMine={onlyMine} view={view} />
      </Tabs.Panel>
    </Tabs>
  );
}
