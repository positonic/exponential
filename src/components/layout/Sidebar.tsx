'use client';

import Link from "next/link";
import { useState } from "react";

export default function Sidebar() {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <aside className="w-64 border-r border-gray-800 p-4">
      <nav className="space-y-2">
        <Link
          href="/introduction"
          className="block rounded-lg px-3 py-2 text-blue-400 hover:bg-gray-800"
        >
          Introduction
        </Link>
        <Link
          href="/another-page"
          className="block rounded-lg px-3 py-2 hover:bg-gray-800"
        >
          Another Page
        </Link>
        
        <div>
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-800"
          >
            <span>Advanced (A Folder)</span>
            <ChevronIcon className={`h-4 w-4 transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isAdvancedOpen && (
            <div className="ml-4 mt-1">
              <Link
                href="/advanced/satori"
                className="block rounded-lg px-3 py-2 hover:bg-gray-800"
              >
                Satori
              </Link>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
} 