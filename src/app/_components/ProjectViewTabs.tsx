"use client";

import { Tabs } from "@mantine/core";
import { IconTable, IconLayoutList, IconTimeline } from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export type ProjectView = "table" | "projects-tasks" | "timeline";

interface ProjectViewTabsProps {
  activeView: ProjectView;
}

const VIEW_TABS = [
  { value: "table", label: "Table", icon: IconTable, path: "/projects" },
  {
    value: "projects-tasks",
    label: "Projects & Tasks",
    icon: IconLayoutList,
    path: "/projects-tasks",
  },
  {
    value: "timeline",
    label: "Timeline",
    icon: IconTimeline,
    path: "/timeline",
  },
] as const;

export function ProjectViewTabs({ activeView }: ProjectViewTabsProps) {
  const { workspace } = useWorkspace();
  const prefix = workspace?.slug ? `/w/${workspace.slug}` : "";

  return (
    <Tabs value={activeView} variant="default" mb="sm">
      <Tabs.List>
        {VIEW_TABS.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            leftSection={<tab.icon size={16} />}
            renderRoot={(props: Record<string, unknown>) => (
              <Link href={`${prefix}${tab.path}`} {...props} />
            )}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
