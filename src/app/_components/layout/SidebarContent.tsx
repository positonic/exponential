"use client";

import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import { IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting, IconKey, IconMicrophone, IconGitBranch, IconUsers, IconTarget, IconCircleCheck, IconSettings, IconDatabase, IconTargetArrow, IconBriefcase, IconLayoutKanban } from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { VideoCount } from "./VideoCount";
import { useNavigationPreferences } from "~/hooks/useNavigationPreferences";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { usePluginNavigation } from "~/hooks/usePluginNavigation";

// Map of icon names to components for plugin navigation
const iconMap = {
  IconTargetArrow,
  IconTarget,
  IconCircleCheck,
  IconUsers,
  IconSettings,
  IconKey,
  IconDatabase,
  IconBriefcase,
} as const;

type IconMapKey = keyof typeof iconMap;

export function SidebarContent() {
  const { isSectionVisible, isItemVisible } = useNavigationPreferences();
  const { workspaceSlug, workspace } = useWorkspace();
  const { itemsBySection } = usePluginNavigation();

  // Use workspace-aware paths when in a workspace context
  const projectsPath = workspaceSlug ? `/w/${workspaceSlug}/projects` : '/projects';

  // Helper to get icon component from name
  const getIcon = (iconName: string) => {
    if (iconName in iconMap) {
      return iconMap[iconName as IconMapKey];
    }
    return IconTarget;
  };

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
        {/* Workspace accordion - only visible when in a workspace */}
        {workspaceSlug && (
          <Accordion.Item value="workspace">
            <Accordion.Control>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <IconBriefcase size={16} className="text-text-muted" />
                  <span className="text-sm font-medium text-text-primary">Workspace</span>
                </div>
              </div>
            </Accordion.Control>
            <Accordion.Panel>
              <NavLink href={`/w/${workspaceSlug}/home`} icon={IconBriefcase}>
                Workspace Home
              </NavLink>
              <NavLink href={`/w/${workspaceSlug}/actions`} icon={IconLayoutKanban}>
                Actions
              </NavLink>
              <NavLink href={`/w/${workspaceSlug}/projects`} icon={IconDeviceProjector}>
                Projects
              </NavLink>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {isSectionVisible("projects") && (
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
              {isItemVisible("projects/my-projects") && (
                <NavLink href={projectsPath} icon={IconDeviceProjector}>
                  My Projects
                </NavLink>
              )}
              {isItemVisible("projects/project-list") && <ProjectList />}
              {isItemVisible("projects/add-project") && <AddProjectButton />}
            </Accordion.Panel>
          </Accordion.Item>
        )}
        
        {isSectionVisible("alignment") && workspace?.type === "personal" && (
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
              {isItemVisible("alignment/overview") && (
                <NavLink href={workspaceSlug ? `/w/${workspaceSlug}/alignment` : '/alignment'} icon={IconTarget}>
                  Overview
                </NavLink>
              )}
              {isItemVisible("alignment/goals") && <GoalList />}
              {/* Plugin navigation items for alignment section */}
              {itemsBySection.alignment
                ?.filter((item) => !item.workspaceScoped || !!workspaceSlug)
                .map((item) => {
                  const IconComponent = getIcon(item.icon);
                  return (
                    <NavLink key={item.id} href={item.href} icon={IconComponent}>
                      {item.label}
                    </NavLink>
                  );
                })}
              {isItemVisible("alignment/wheel-of-life") && (
                <NavLink href="/wheel-of-life" icon={IconCircleCheck}>
                  Wheel of Life
                </NavLink>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {isSectionVisible("teams") && (
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
              {isItemVisible("teams/my-teams") && (
                <NavLink href="/teams" icon={IconUsers}>
                  My Teams
                </NavLink>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {isSectionVisible("tools") && (
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
              {/* Capture */}
              {isItemVisible("tools/days") && (
                <NavLink href="/days" icon={IconCalendarEvent}>
                  Days
                </NavLink>
              )}
              {isItemVisible("tools/journal") && (
                <NavLink href="/journal" icon={IconWriting}>
                  Journal
                </NavLink>
              )}

              <div className="my-1.5 border-t border-border-primary" />

              {/* Reference */}
              {isItemVisible("tools/media") && (
                <NavLink href="/videos" icon={IconVideo}>
                  Media
                  <VideoCount />
                </NavLink>
              )}
              {isItemVisible("tools/workflows") && (
                <NavLink href="/workflows" icon={IconGitBranch}>
                  Workflows
                </NavLink>
              )}

              <div className="my-1.5 border-t border-border-primary" />

              {/* Resources */}
              {isItemVisible("tools/meetings") && (
                <NavLink href="/meetings" icon={IconMicrophone}>
                  Meetings
                </NavLink>
              )}
              {isItemVisible("tools/knowledge-base") && (
                <NavLink href={workspaceSlug ? `/w/${workspaceSlug}/knowledge-base` : '/knowledge-base'} icon={IconDatabase}>
                  Knowledge Base
                </NavLink>
              )}
              <NavLink href="/settings" icon={IconSettings}>
                Settings
              </NavLink>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {/* Settings fallback when Tools section is hidden */}
        {!isSectionVisible("tools") && (
          <div className="px-1 pt-2">
            <NavLink href="/settings" icon={IconSettings}>
              Settings
            </NavLink>
          </div>
        )}
      </Accordion>
    </div>
  );
}