"use client";

import React from "react";
import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import {
  IconDeviceProjector, IconTarget, IconLayoutGrid,
} from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export function SidebarContent(): React.JSX.Element {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: enabledPlugins } = api.pluginConfig.getEnabled.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId, staleTime: 5 * 60 * 1000 },
  );

  const isProductEnabled = enabledPlugins?.includes("product") ?? false;
  return (
    <div className="space-y-0.5">
      <Accordion 
        defaultValue="projects" 
        classNames={{
          root: 'bg-transparent space-y-0.5',
          item: 'rounded-lg transition-all duration-200',
          control: 'hover:bg-transparent text-text-primary font-medium transition-all duration-200 py-1',
          panel: 'pt-0.5 pb-1 px-1'
        }}
        styles={{
          item: {
            borderBottom: 'none',
            borderTop: 'none',
            border: 'none'
          },
          content: {
            borderTop: 'none'
          }
        }}
      >
        <Accordion.Item value="projects">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconDeviceProjector size={16} className="text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Projects</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <NavLink href="/projects" icon={IconDeviceProjector}>
              My Projects
            </NavLink>
          
            <ProjectList />
            <AddProjectButton />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Product Management Plugin nav item */}
        {isProductEnabled && workspaceSlug && (
          <NavLink href={`/w/${workspaceSlug}/products`} icon={IconLayoutGrid}>
            Products
          </NavLink>
        )}

        <Accordion.Item value="goals">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconTarget size={16} className="text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Alignment</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <GoalList />
          </Accordion.Panel>
        </Accordion.Item>

      </Accordion>
    </div>
  );
}