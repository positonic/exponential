"use client";

import { Accordion } from "@mantine/core";
import { ModernAddProjectButton } from "../ModernAddProjectButton";
import { ModernProjectList } from "./ProjectListModern";
import { GoalList } from "./GoalList";
import { IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting, IconKey, IconPlug, IconMicrophone, IconGitBranch, IconUsers, IconSparkles, IconBrain } from "@tabler/icons-react";
import { ModernNavLink } from "./NavLinksModern";
import { VideoCount } from "./VideoCount";
// import Link from "next/link";

export function ModernSidebarContent() {
  return (
    <div className="space-y-4">
      <Accordion 
        defaultValue="projects" 
        classNames={{
          root: 'bg-transparent',
          item: 'bg-gradient-to-br from-gray-800/50 to-gray-900/30 border border-gray-700/50 rounded-lg backdrop-blur-sm transition-all duration-300 hover:from-gray-700/60 hover:to-gray-800/40 hover:border-gray-600/60 hover:shadow-lg mb-3',
          control: 'hover:bg-transparent text-gray-300 font-medium transition-all duration-200',
          panel: 'pt-3 pb-2 px-1'
        }}
      >
        <Accordion.Item value="projects">
          <Accordion.Control>
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <IconDeviceProjector size={18} className="text-blue-400 group-hover:text-blue-300 transition-colors duration-200" />
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors duration-200">Projects</span>
              </div>
              <div className="flex items-center gap-2"></div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <ModernNavLink href="/projects" icon={IconDeviceProjector}>
              My Projects
            </ModernNavLink>
          
            <ModernProjectList />
            <ModernAddProjectButton />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="goals">
          <Accordion.Control>
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                </div>
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors duration-200">Alignment</span>
              </div>
              <div className="flex items-center gap-2"></div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <GoalList />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="teams">
          <Accordion.Control>
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <IconUsers size={18} className="text-green-400 group-hover:text-green-300 transition-colors duration-200" />
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors duration-200">Teams</span>
              </div>
              <div className="flex items-center gap-2"></div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <ModernNavLink href="/teams" icon={IconUsers}>
              My Teams
            </ModernNavLink>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="Tools">
          <Accordion.Control>
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <IconKey size={12} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors duration-200">Tools</span>
              </div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1.5 px-2">
              {/* <ModernNavLink href="/startup-routine" icon={IconSunrise}>
                Startup Routine
              </ModernNavLink>
              <ModernNavLink href="/wind-down" icon={IconMoonStars}>
                Wind Down
              </ModernNavLink> */}
              <ModernNavLink href="/days" icon={IconCalendarEvent}>
                Days
              </ModernNavLink>
              <ModernNavLink href="/videos" icon={IconVideo}>
                Media
                <VideoCount />
              </ModernNavLink>
              <ModernNavLink href="/journal" icon={IconWriting}>
                Journal
              </ModernNavLink>
              <ModernNavLink href="/meetings" icon={IconMicrophone}>
                Meetings
              </ModernNavLink>
              <ModernNavLink href="/workflows" icon={IconGitBranch}>
                Workflows
              </ModernNavLink>
              <ModernNavLink href="/ai-sales-demo" icon={IconSparkles}>
                AI Sales Demo
              </ModernNavLink>
              <ModernNavLink href="/integrations" icon={IconPlug}>
                Connect Services
              </ModernNavLink>
              <ModernNavLink href="/ai-history" icon={IconBrain}>
                AI History
              </ModernNavLink>
              <ModernNavLink href="/tokens" icon={IconKey}>
                API Access
              </ModernNavLink>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}