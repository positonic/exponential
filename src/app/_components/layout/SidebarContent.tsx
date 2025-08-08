"use client";

import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import { IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting, IconKey, IconPlug, IconMicrophone, IconGitBranch, IconUsers, IconSparkles, IconBrain, IconTarget } from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { VideoCount } from "./VideoCount";
// import Link from "next/link";

export function SidebarContent() {
  return (
    <div className="space-y-0.5">
      <Accordion 
        defaultValue="projects" 
        classNames={{
          root: 'bg-transparent space-y-0.5',
          item: 'border border-gray-800 rounded-lg transition-all duration-200 hover:border-gray-700',
          control: 'hover:bg-transparent text-gray-300 font-medium transition-all duration-200 py-1',
          panel: 'pt-0.5 pb-1 px-1'
        }}
      >
        <Accordion.Item value="projects">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconDeviceProjector size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-300">Projects</span>
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
        
        <Accordion.Item value="goals">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconTarget size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-300">Alignment</span>
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
                <IconUsers size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-300">Teams</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <NavLink href="/teams" icon={IconUsers}>
              My Teams
            </NavLink>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="Tools">
          <Accordion.Control>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconKey size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-300">Tools</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {/* <ModernNavLink href="/startup-routine" icon={IconSunrise}>
                Startup Routine
              </ModernNavLink>
              <ModernNavLink href="/wind-down" icon={IconMoonStars}>
                Wind Down
              </ModernNavLink> */}
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