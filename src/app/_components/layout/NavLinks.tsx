'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconCalendarEvent,
  IconCalendar,
  IconHome,
  IconUsers,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { usePluginNavigation } from "~/hooks/usePluginNavigation";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

// Icon map for plugin navigation items in main nav
const mainNavIconMap = {
  IconUsers,
  IconHome,
} as const;

type MainNavIconKey = keyof typeof mainNavIconMap;

// Reusable NavLink component
export function NavLink({ href, icon: Icon, children, count }: { 
  href: string; 
  icon?: React.ComponentType<any>;
  children: React.ReactNode;
  count?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;
  
  return (
    <Link
      href={href}
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

export function NavLinks() {
  const { workspaceSlug } = useWorkspace();
  const { itemsBySection } = usePluginNavigation();

  // Home always goes to /home regardless of workspace context
  const homePath = '/home';

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
      <NavLink href={homePath} icon={IconHome}>
        Home
      </NavLink>
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </NavLink>
      <NavLink href="/act" icon={IconPlayerPlay}>
        Today
      </NavLink>
      {/* Plugin navigation items for main section */}
      {mainPluginItems.map((item) => {
        const IconComponent = getIcon(item.icon);
        return (
          <NavLink key={item.id} href={item.href} icon={IconComponent}>
            {item.label}
          </NavLink>
        );
      })}
      <NavLink href="/daily-plan" icon={IconCalendarEvent} count={<TodayCount />}>
        Daily plan
      </NavLink>
      <NavLink href="/calendar" icon={IconCalendar}>
        Calendar
      </NavLink>

      {/* Workspace Switcher - below Act, above accordion sections */}
      <div className="pt-4 mt-2 border-t border-border-primary">
        <WorkspaceSwitcher />
      </div>
    </div>
  );
}