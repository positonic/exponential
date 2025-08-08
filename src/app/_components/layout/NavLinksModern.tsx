'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconCalendarEvent,
  IconCalendarTime,
  IconHome,
  
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { UpcomingCount } from "./UpcomingCount";

// Modern reusable NavLink component
export function ModernNavLink({ href, icon: Icon, children, count }: { 
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
      className={`group relative flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
        isActive 
          ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white border border-blue-500/30 shadow-lg shadow-blue-500/10' 
          : 'text-gray-300 hover:bg-gradient-to-r hover:from-gray-700/60 hover:to-gray-800/40 hover:text-white hover:shadow-md'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-400 to-purple-500 rounded-r-full" />
      )}
      {Icon && (
        <Icon className={`mr-3 h-5 w-5 transition-all duration-300 ${
          isActive ? 'text-blue-400 scale-110' : 'text-gray-400 group-hover:text-gray-300 group-hover:scale-105'
        }`} />
      )}
      <span className="flex-1">{children}</span>
      {count && (
        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
          isActive 
            ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' 
            : 'bg-gray-700/60 text-gray-400 group-hover:bg-gray-600/80 group-hover:text-gray-300'
        }`}>
          {count}
        </span>
      )}
    </Link>
  );
}

export function ModernNavLinks() {
  return (
    <div className="space-y-2 px-2">
      <ModernNavLink href="/home" icon={IconHome}>
        Home
      </ModernNavLink>
      <ModernNavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </ModernNavLink>
      <ModernNavLink href="/today" icon={IconCalendarEvent} count={<TodayCount />}>
        Today
      </ModernNavLink>
      <ModernNavLink href="/upcoming" icon={IconCalendarTime} count={<UpcomingCount />}>
        Upcoming
      </ModernNavLink>
    </div>
  );
}