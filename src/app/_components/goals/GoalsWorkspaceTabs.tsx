"use client";

import { Tabs } from "@mantine/core";
import { IconTarget, IconChartBar } from "@tabler/icons-react";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { OkrDashboard } from "~/plugins/okr/client/components/OkrDashboard";
import { useGoalsViewParams, type GoalsTab } from "./useGoalsViewParams";

/**
 * The goals page body: Goals / OKRs tabs. The "Mine" and "Timeline" toggles
 * are rendered by each dashboard in its own header, beside its period
 * controls, but their state lives in the URL here so both toggles apply to
 * whichever tab is active. There is no separate "My Goals" tab and Timeline
 * is not a period.
 */
export function GoalsWorkspaceTabs() {
  const { tab, onlyMine, view, isRewritingLegacyUrl, setTab, setOnlyMine, setView } =
    useGoalsViewParams();

  // One render at most, and only for a retired URL — see the hook's note.
  if (isRewritingLegacyUrl) return null;

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
      <div className="border-b border-border-primary px-10">
        <Tabs.List>
          <Tabs.Tab value="goals" fz="xs" leftSection={<IconTarget size={16} />}>
            Goals
          </Tabs.Tab>
          <Tabs.Tab value="okrs" fz="xs" leftSection={<IconChartBar size={16} />}>
            OKRs
          </Tabs.Tab>
        </Tabs.List>
      </div>

      <Tabs.Panel value="goals">
        <InitiativeDashboard
          onlyMine={onlyMine}
          view={view}
          onOnlyMineChange={setOnlyMine}
          onViewChange={setView}
        />
      </Tabs.Panel>

      <Tabs.Panel value="okrs">
        <OkrDashboard
          onlyMine={onlyMine}
          view={view}
          onOnlyMineChange={setOnlyMine}
          onViewChange={setView}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
