'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconCalendarEvent,
  IconCalendarTime,
  IconHome,
  IconBriefcase,
  IconUsers,
  IconCalendarWeek,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { UpcomingCount } from "./UpcomingCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { usePluginNavigation } from "~/hooks/usePluginNavigation";

// Icon map for plugin navigation items in main nav
const mainNavIconMap = {
  IconUsers,
  IconHome,
  IconBriefcase,
} as const;

type MainNavIconKey = keyof typeof mainNavIconMap;

// Reusable NavLink component
export function NavLink({ href, icon: Icon, children, count, onClick }: {
  href: string;
  icon?: React.ComponentType<any>;
  children: React.ReactNode;
  count?: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;
  
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-surface-secondary text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
      )}
      {Icon && (
        <Icon className={`mr-3 h-4 w-4 transition-colors duration-200 ${
          isActive ? 'text-blue-500' : 'text-text-muted group-hover:text-text-secondary'
        }`} />
      )}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {count && (
        <span className={`ml-auto pl-2 px-2 py-0.5 rounded-md text-xs font-medium transition-all duration-200 flex-shrink-0 ${
          isActive 
            ? 'bg-blue-500/20 text-blue-400' 
            : 'bg-surface-tertiary text-text-secondary group-hover:bg-surface-hover'
        }`}>
          {count}
        </span>
      )}
    </Link>
  );
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { workspaceSlug } = useWorkspace();
  const { itemsBySection } = usePluginNavigation();

  // Generate workspace-aware paths
  const homePath = workspaceSlug ? `/w/${workspaceSlug}/home` : '/home';
  const workspacePath = workspaceSlug ? `/w/${workspaceSlug}/workspace` : null;
  const weeklyReviewPath = workspaceSlug ? `/w/${workspaceSlug}/weekly-review` : null;

  // Helper to get icon component from name
  const getIcon = (iconName: string) => {
    if (iconName in mainNavIconMap) {
      return mainNavIconMap[iconName as MainNavIconKey];
    }
    return IconUsers; // Default fallback
  };

  // Get plugin items for "main" section, filtered by workspace availability
  const mainPluginItems = itemsBySection.main
    ?.filter((item) => !item.workspaceScoped || !!workspaceSlug)
    .sort((a, b) => a.order - b.order) ?? [];

  return (
    <div className="space-y-1">
      <NavLink href={homePath} icon={IconHome} onClick={onNavigate}>
        Home
      </NavLink>
      {workspacePath && (
        <NavLink href={workspacePath} icon={IconBriefcase} onClick={onNavigate}>
          Workspace
        </NavLink>
      )}
      {weeklyReviewPath && (
        <NavLink href={weeklyReviewPath} icon={IconCalendarWeek} onClick={onNavigate}>
          Weekly Review
        </NavLink>
      )}
      {/* Plugin navigation items for main section */}
      {mainPluginItems.map((item) => {
        const IconComponent = getIcon(item.icon);
        return (
          <NavLink key={item.id} href={item.href} icon={IconComponent} onClick={onNavigate}>
            {item.label}
          </NavLink>
        );
      })}
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />} onClick={onNavigate}>
        Inbox
      </NavLink>
      <NavLink href="/today" icon={IconCalendarEvent} count={<TodayCount />} onClick={onNavigate}>
        Today
      </NavLink>
      <NavLink href="/upcoming" icon={IconCalendarTime} count={<UpcomingCount />} onClick={onNavigate}>
        Upcoming
      </NavLink>
    </div>
  );
}