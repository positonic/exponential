"use client";

import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import { IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting } from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { VideoCount } from "./VideoCount";
import Link from "next/link";

export function SidebarContent() {
  return (
    <div>
      <Accordion defaultValue="projects">
        <Accordion.Item value="projects">
          <Accordion.Control>
            <div className="flex items-center justify-between text-gray-400 hover:text-gray-300">
              <span className="text-sm font-medium">Projects</span>
              <div className="flex items-center gap-2"></div>
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
            <div className="flex items-center justify-between text-gray-400 hover:text-gray-300">
              <span className="text-sm font-medium">Alignment</span>
              <div className="flex items-center gap-2"></div>
            </div>
          </Accordion.Control>
          <Accordion.Panel>
            <GoalList />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="Tools">
          <Accordion.Control>
            <span className="text-sm font-medium text-gray-400 hover:text-gray-300">
              Tools
            </span>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {/* <NavLink href="/startup-routine" icon={IconSunrise}>
                Startup Routine
              </NavLink>
              <NavLink href="/wind-down" icon={IconMoonStars}>
                Wind Down
              </NavLink> */}
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
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
