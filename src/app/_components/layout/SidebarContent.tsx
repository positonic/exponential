"use client";

import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import {
  IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting, IconKey,
  IconMicrophone, IconGitBranch, IconUsers, IconTarget, IconSparkles, IconPlug,
  IconBrain, IconLayoutGrid,
} from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { VideoCount } from "./VideoCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export function SidebarContent() {
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

        <Accordion.Item value="teams">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconUsers size={16} className="text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Teams</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <NavLink href="/teams" icon={IconUsers}>
              My Teams
            </NavLink>
            <NavLink href="/weekly-review" icon={IconUsers}>
              Weekly Project Review
            </NavLink>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="Tools">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconKey size={16} className="text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Tools</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              <NavLink href="/days" icon={IconCalendarEvent}>
                Days
              </NavLink>
              <NavLink href="/videos" icon={IconVideo}>
                Media
                <VideoCount />
              </NavLink>
              <NavLink href="/journal" icon={IconWriting}>
                Journal
              </NavLink>
              <NavLink href="/meetings" icon={IconMicrophone}>
                Meetings
              </NavLink>
              <NavLink href="/workflows" icon={IconGitBranch}>
                Workflows
              </NavLink>
              <NavLink href="/ai-sales-demo" icon={IconSparkles}>
                AI Sales Demo
              </NavLink>
              <NavLink href="/integrations" icon={IconPlug}>
                Connect Services
              </NavLink>
              <NavLink href="/ai-history" icon={IconBrain}>
                AI History
              </NavLink>
              <NavLink href="/tokens" icon={IconKey}>
                API Access
              </NavLink>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}