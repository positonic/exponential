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

// Create a reusable NavLink component
export function NavLink({ href, icon: Icon, children, count }: { 
  href: string; 
  icon?: React.ComponentType<any>;
  children: React.ReactNode;
  count?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
        pathname === href ? 'bg-red-900/30' : ''
      }`}
    >
      {Icon && <Icon className="mr-3 h-5 w-5" />}
      {children}
      {count && <span className="ml-auto text-gray-500">{count}</span>}
    </Link>
  );
}

export function NavLinks() {
  return (
    <>
      <NavLink href="/home" icon={IconHome}>
        Home
      </NavLink>
      <NavLink href="/inbox" icon={IconInbox}>
        Inbox
        <InboxCount />
      </NavLink>
      <NavLink href="/today" icon={IconCalendarEvent}>
        Today
        <TodayCount />
      </NavLink>
      <NavLink href="/upcoming" icon={IconCalendarTime}>
        Upcoming
        <UpcomingCount />
      </NavLink>
      
    </>
  );
}