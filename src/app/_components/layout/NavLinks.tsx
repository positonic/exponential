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
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { UpcomingCount } from "./UpcomingCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";

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

  // Generate workspace-aware paths
  const homePath = workspaceSlug ? `/w/${workspaceSlug}/home` : '/home';
  const workspacePath = workspaceSlug ? `/w/${workspaceSlug}/workspace` : null;
  const crmPath = workspaceSlug ? `/w/${workspaceSlug}/crm` : null;

  return (
    <div className="space-y-1">
      <NavLink href={homePath} icon={IconHome}>
        Home
      </NavLink>
      {workspacePath && (
        <NavLink href={workspacePath} icon={IconBriefcase}>
          Workspace
        </NavLink>
      )}
      {crmPath && (
        <NavLink href={crmPath} icon={IconUsers}>
          CRM
        </NavLink>
      )}
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </NavLink>
      <NavLink href="/today" icon={IconCalendarEvent} count={<TodayCount />}>
        Today
      </NavLink>
      <NavLink href="/upcoming" icon={IconCalendarTime} count={<UpcomingCount />}>
        Upcoming
      </NavLink>
    </div>
  );
}