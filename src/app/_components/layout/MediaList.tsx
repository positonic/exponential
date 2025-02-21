'use client';

import { IconVideo } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MediaList() {
  const pathname = usePathname();

  return (
    <div className="mt-1 space-y-1">
            <Link
                href="/videos"
                className={`group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 ${
                  pathname === '/videos' ? 'bg-red-900/30' : ''
                }`}
              >
                <IconVideo className="mr-3 h-5 w-5" />
                <span>Videos</span>
              </Link>
    </div>
  );
} 