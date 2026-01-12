"use client";

import { Accordion } from "@mantine/core";
import { AddProjectButton } from "../AddProjectButton";
import { ProjectList } from "./ProjectList";
import { GoalList } from "./GoalList";
import { IconCalendarEvent, IconDeviceProjector, IconVideo, IconWriting, IconKey, IconPlug, IconMicrophone, IconGitBranch, IconUsers, IconSparkles, IconBrain, IconTarget, IconRobot, IconCircleCheck, IconSettings, IconDatabase, IconTargetArrow } from "@tabler/icons-react";
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
} as const;

type IconMapKey = keyof typeof iconMap;

export function SidebarContent({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { isSectionVisible, isItemVisible } = useNavigationPreferences();
  const { workspaceSlug } = useWorkspace();
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
                <NavLink href={projectsPath} icon={IconDeviceProjector} onClick={onNavigate}>
                  My Projects
                </NavLink>
              )}
              {isItemVisible("projects/project-list") && <ProjectList onNavigate={onNavigate} />}
              {isItemVisible("projects/add-project") && <AddProjectButton />}
            </Accordion.Panel>
          </Accordion.Item>
        )}
        
        {isSectionVisible("alignment") && (
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
              {isItemVisible("alignment/goals") && <GoalList onNavigate={onNavigate} />}
              {/* Plugin navigation items for alignment section */}
              {itemsBySection.alignment
                ?.filter((item) => !item.workspaceScoped || !!workspaceSlug)
                .map((item) => {
                  const IconComponent = getIcon(item.icon);
                  return (
                    <NavLink key={item.id} href={item.href} icon={IconComponent} onClick={onNavigate}>
                      {item.label}
                    </NavLink>
                  );
                })}
              {isItemVisible("alignment/wheel-of-life") && (
                <NavLink href="/wheel-of-life" icon={IconCircleCheck} onClick={onNavigate}>
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
                <NavLink href="/teams" icon={IconUsers} onClick={onNavigate}>
                  My Teams
                </NavLink>
              )}
              {isItemVisible("teams/weekly-review") && (
                <NavLink href="/weekly-review" icon={IconUsers} onClick={onNavigate}>
                  Weekly Project Review
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
              <div className="space-y-1">
                {isItemVisible("tools/days") && (
                  <NavLink href="/days" icon={IconCalendarEvent} onClick={onNavigate}>
                    Days
                  </NavLink>
                )}
                {isItemVisible("tools/media") && (
                  <NavLink href="/videos" icon={IconVideo} onClick={onNavigate}>
                    Media
                    <VideoCount />
                  </NavLink>
                )}
                {isItemVisible("tools/journal") && (
                  <NavLink href="/journal" icon={IconWriting} onClick={onNavigate}>
                    Journal
                  </NavLink>
                )}
                {isItemVisible("tools/meetings") && (
                  <NavLink href="/meetings" icon={IconMicrophone} onClick={onNavigate}>
                    Meetings
                  </NavLink>
                )}
                {isItemVisible("tools/workflows") && (
                  <NavLink href="/workflows" icon={IconGitBranch} onClick={onNavigate}>
                    Workflows
                  </NavLink>
                )}
                {isItemVisible("tools/ai-sales-demo") && (
                  <NavLink href="/ai-sales-demo" icon={IconSparkles} onClick={onNavigate}>
                    AI Sales Demo
                  </NavLink>
                )}
                {isItemVisible("tools/ai-automation") && (
                  <NavLink href="/ai-automation" icon={IconRobot} onClick={onNavigate}>
                    AI Automation
                  </NavLink>
                )}
                {isItemVisible("tools/connect-services") && (
                  <NavLink href="/integrations" icon={IconPlug} onClick={onNavigate}>
                    Connect Services
                  </NavLink>
                )}
                {isItemVisible("tools/ai-history") && (
                  <NavLink href="/ai-history" icon={IconBrain} onClick={onNavigate}>
                    AI History
                  </NavLink>
                )}
                {isItemVisible("tools/knowledge-base") && (
                  <NavLink href={workspaceSlug ? `/w/${workspaceSlug}/knowledge-base` : '/knowledge-base'} icon={IconDatabase} onClick={onNavigate}>
                    Knowledge Base
                  </NavLink>
                )}
                {isItemVisible("tools/api-access") && (
                  <NavLink href="/tokens" icon={IconKey} onClick={onNavigate}>
                    API Access
                  </NavLink>
                )}
                {/* Settings link - always visible */}
                <NavLink href="/settings" icon={IconSettings} onClick={onNavigate}>
                  Settings
                </NavLink>
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {/* Settings fallback when Tools section is hidden */}
        {!isSectionVisible("tools") && (
          <div className="px-1 pt-2">
            <NavLink href="/settings" icon={IconSettings} onClick={onNavigate}>
              Settings
            </NavLink>
          </div>
        )}
      </Accordion>
    </div>
  );
}