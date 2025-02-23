'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconCalendarEvent,
  IconCalendarTime,
  IconVideo,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { UpcomingCount } from "./UpcomingCount";
import { VideoCount } from "./VideoCount";

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      <Link
        href="/inbox"
        className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
          pathname === '/inbox' ? 'bg-red-900/30' : ''
        }`}
      >
        <IconInbox className="mr-3 h-5 w-5" />
        <span>Inbox</span>
        <InboxCount />
      </Link>
      <Link
        href="/today"
        className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
          pathname === '/today' ? 'bg-red-900/30' : ''
        }`}
      >
        <IconCalendarEvent className="mr-3 h-5 w-5" />
        <span>Today</span>
        <TodayCount />
      </Link>
      <Link
        href="/upcoming"
        className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
          pathname === '/upcoming' ? 'bg-red-900/30' : ''
        }`}
      >
        <IconCalendarTime className="mr-3 h-5 w-5" />
        <span>Upcoming</span>
        <UpcomingCount />
      </Link>
      <Link
        href="/videos"
        className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
          pathname === '/videos' ? 'bg-red-900/30' : ''
        }`}
      >
        <IconVideo className="mr-3 h-5 w-5" />
        <span>Videos</span>
        <VideoCount />
      </Link>
    </>
  );
} 